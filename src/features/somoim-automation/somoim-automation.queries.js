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
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM somoim_automation_jobs
          WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async listJobs({ statuses = null, limit, offset }) {
      const result = await db.query(
        `SELECT id, requested_by AS "requestedBy", type, payload, status, attempts,
                claimed_at AS "claimedAt", completed_at AS "completedAt",
                error_message AS "errorMessage", result,
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
    async requeueStaleJobs({ staleAfterSeconds, maxAttempts, exhaustedMessage }) {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = CASE WHEN attempts >= $2 THEN 'needs_manual_review' ELSE 'pending' END,
                claimed_at = CASE WHEN attempts >= $2 THEN claimed_at ELSE NULL END,
                error_message = CASE WHEN attempts >= $2 THEN $3 ELSE error_message END,
                completed_at = CASE WHEN attempts >= $2 THEN now() ELSE completed_at END,
                updated_at = now()
          WHERE status = 'claimed'
            AND claimed_at < now() - make_interval(secs => $1)
          RETURNING id, status`,
        [staleAfterSeconds, maxAttempts, exhaustedMessage],
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
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, status, errorMessage, result],
      );
      return queryResult.rows[0] ?? null;
    },
  };
}
