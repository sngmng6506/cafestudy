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
