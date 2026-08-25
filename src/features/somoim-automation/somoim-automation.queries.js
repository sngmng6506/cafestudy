export function createSomoimAutomationQueries(db) {
  return {
    async createJob({ requestedBy, type, payload }) {
      const result = await db.query(
        `INSERT INTO somoim_automation_jobs (requested_by, type, payload)
         VALUES ($1, $2, $3)
         RETURNING id, requested_by AS "requestedBy", type, payload, status, attempts,
                   claimed_at AS "claimedAt", completed_at AS "completedAt",
                   error_message AS "errorMessage", result,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [requestedBy, type, payload],
      );
      return result.rows[0];
    },

    async getJob(id) {
      const result = await db.query(
        `SELECT id, requested_by AS "requestedBy", type, payload, status, attempts,
                claimed_at AS "claimedAt", completed_at AS "completedAt",
                error_message AS "errorMessage", result,
                submit_attempted_at AS "submitAttemptedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM somoim_automation_jobs
          WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    // worker가 되돌릴 수 없는 제출을 하기 직전에 부른다. 이 표시가 남은 job은
    // 다시 실행하지 않는다 — 앱에 정모가 이미 생겼을 수 있기 때문이다.
    async markSubmitAttempted(id) {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET submit_attempted_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'claimed'
          RETURNING id, submit_attempted_at AS "submitAttemptedAt"`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async listJobs({ statuses = null, limit, offset }) {
      const result = await db.query(
        `SELECT id, requested_by AS "requestedBy", type, payload, status, attempts,
                claimed_at AS "claimedAt", completed_at AS "completedAt",
                error_message AS "errorMessage", result,
                submit_attempted_at AS "submitAttemptedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM somoim_automation_jobs
          WHERE ($1::text[] IS NULL OR status = ANY($1))
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
        [statuses, limit, offset],
      );
      return result.rows;
    },

    // worker가 claim한 뒤 결과를 보고하지 못하고 죽으면 job이 claimed로 남는다.
    // 재시도 여유가 있으면 pending으로 되돌리고, 다 썼으면 사람에게 넘긴다.
    //
    // 단 submit_attempted_at이 찍힌 job은 재시도 여유와 무관하게 사람에게 넘긴다.
    // 제출 버튼을 이미 눌렀을 수 있어 다시 돌리면 정모가 하나 더 생긴다.
    async requeueStaleJobs({
      staleAfterSeconds,
      maxAttempts,
      exhaustedMessage,
      submitAttemptedMessage,
    }) {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = CASE
                  WHEN submit_attempted_at IS NOT NULL THEN 'needs_manual_review'
                  WHEN attempts >= $2 THEN 'needs_manual_review'
                  ELSE 'pending' END,
                claimed_at = CASE
                  WHEN submit_attempted_at IS NOT NULL THEN claimed_at
                  WHEN attempts >= $2 THEN claimed_at
                  ELSE NULL END,
                error_message = CASE
                  WHEN submit_attempted_at IS NOT NULL THEN $4
                  WHEN attempts >= $2 THEN $3
                  ELSE error_message END,
                completed_at = CASE
                  WHEN submit_attempted_at IS NOT NULL THEN now()
                  WHEN attempts >= $2 THEN now()
                  ELSE completed_at END,
                updated_at = now()
          WHERE status = 'claimed'
            AND claimed_at < now() - make_interval(secs => $1)
          RETURNING id, status, submit_attempted_at AS "submitAttemptedAt"`,
        [staleAfterSeconds, maxAttempts, exhaustedMessage, submitAttemptedMessage],
      );
      return result.rows;
    },

    async claimNextJob() {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = 'claimed',
                attempts = attempts + 1,
                claimed_at = now(),
                updated_at = now()
          WHERE id = (
            SELECT id
              FROM somoim_automation_jobs
             WHERE status = 'pending'
             ORDER BY created_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1
          )
          RETURNING id, requested_by AS "requestedBy", type, payload, status, attempts,
                    claimed_at AS "claimedAt", completed_at AS "completedAt",
                    error_message AS "errorMessage", result,
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
      );
      return result.rows[0] ?? null;
    },

    async completeJob({ id, result }) {
      const queryResult = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = 'succeeded',
                result = $2,
                error_message = null,
                completed_at = now(),
                updated_at = now()
          WHERE id = $1 AND status = 'claimed'
          RETURNING id, requested_by AS "requestedBy", type, payload, status, attempts,
                    claimed_at AS "claimedAt", completed_at AS "completedAt",
                    error_message AS "errorMessage", result,
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, result],
      );
      return queryResult.rows[0] ?? null;
    },

    // worker가 일시적 장애를 보고했을 때 job을 다시 pending으로 되돌린다.
    // requeueStaleJobs와 달리 이건 worker가 살아서 실패를 직접 알린 경우다.
    // error_message를 남겨 admin job 목록에서 지난 시도가 왜 실패했는지 볼 수 있게 한다.
    async requeueJob(id, errorMessage = null) {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = 'pending', claimed_at = NULL, error_message = $2, updated_at = now()
          WHERE id = $1 AND status = 'claimed'
          RETURNING id, status, attempts`,
        [id, errorMessage],
      );
      return result.rows[0] ?? null;
    },

    // 모임이 취소되면 아직 아무도 안 집어간 job만 중단한다.
    // status='pending' 조건이 핵심 — claim된 job은 worker가 기기를 조작하는 중이라
    // 여기서 상태를 바꾸면 worker의 complete/fail 보고와 어긋난다.
    async cancelPendingJob({ id, errorMessage }) {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = 'failed',
                error_message = $2,
                completed_at = now(),
                updated_at = now()
          WHERE id = $1 AND status = 'pending'
          RETURNING id, status`,
        [id, errorMessage],
      );
      return result.rows[0] ?? null;
    },

    async failJob({ id, errorMessage, needsManualReview, result }) {
      const status = needsManualReview ? 'needs_manual_review' : 'failed';
      const queryResult = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = $2,
                error_message = $3,
                result = $4,
                completed_at = now(),
                updated_at = now()
          WHERE id = $1 AND status = 'claimed'
          RETURNING id, requested_by AS "requestedBy", type, payload, status, attempts,
                    claimed_at AS "claimedAt", completed_at AS "completedAt",
                    error_message AS "errorMessage", result,
                    submit_attempted_at AS "submitAttemptedAt",
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, status, errorMessage, result],
      );
      return queryResult.rows[0] ?? null;
    },
  };
}
