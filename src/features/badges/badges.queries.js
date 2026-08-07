function badgeColumns(prefix = '') {
  const p = prefix ? `${prefix}.` : '';
  return `
    ${p}id,
    ${p}title,
    ${p}description,
    ${p}image_object_key AS "imageObjectKey",
    ${p}provider,
    ${p}model,
    ${p}prompt,
    ${p}created_at AS "createdAt"
  `;
}

function generationColumns() {
  return `id, user_id AS "userId", prompt, provider, model,
          image_object_key AS "imageObjectKey", point_cost AS "pointCost",
          status, error_message AS "errorMessage", created_at AS "createdAt"`;
}

export function createBadgesQueries(db) {
  return {
    async reserveGeneration({ id, userId, prompt, provider, model, pointCost, dailyLimit }) {
      return db.transaction(async (client) => {
        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        await client.query(
          `UPDATE badge_generations
              SET status = 'failed', error_message = 'stale_processing'
            WHERE user_id = $1 AND status = 'processing'
              AND created_at < now() - interval '10 minutes'`,
          [userId],
        );

        const active = await client.query(
          `SELECT 1 FROM badge_generations
            WHERE user_id = $1 AND status = 'processing' LIMIT 1`,
          [userId],
        );
        if (active.rowCount > 0) return { outcome: 'in_progress' };

        const count = await client.query(
          `SELECT COUNT(*)::int AS count FROM badge_generations
            WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
          [userId],
        );
        if (count.rows[0].count >= dailyLimit) return { outcome: 'daily_limit' };

        const result = await client.query(
          `INSERT INTO badge_generations
             (id, user_id, prompt, provider, model, image_object_key, point_cost, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')
           RETURNING ${generationColumns()}`,
          [id, userId, prompt, provider, model, `pending:${id}`, pointCost],
        );
        return { outcome: 'created', generation: result.rows[0] };
      });
    },

    async completeGeneration({ generationId, userId, objectKey }) {
      const result = await db.query(
        `UPDATE badge_generations
            SET status = 'preview', image_object_key = $3, error_message = NULL
          WHERE id = $1 AND user_id = $2 AND status = 'processing'
        RETURNING ${generationColumns()}`,
        [generationId, userId, objectKey],
      );
      return result.rows[0] ?? null;
    },

    async failGeneration({ generationId, userId, message }) {
      await db.query(
        `UPDATE badge_generations
            SET status = 'failed', error_message = $3
          WHERE id = $1 AND user_id = $2 AND status = 'processing'`,
        [generationId, userId, String(message ?? 'failed').slice(0, 1000)],
      );
    },

    async getGenerationForUser({ generationId, userId }) {
      const result = await db.query(
        `SELECT ${generationColumns()} FROM badge_generations
          WHERE id = $1 AND user_id = $2`,
        [generationId, userId],
      );
      return result.rows[0];
    },

    async countUserBadges(userId) {
      const result = await db.query(
        `SELECT COUNT(*)::int AS count FROM user_badges WHERE user_id = $1`,
        [userId],
      );
      return result.rows[0].count;
    },

    async createBadgeFromGeneration({ userId, generationId, title, description, maxBadges }) {
      return db.transaction(async (client) => {
        const generationResult = await client.query(
          `SELECT id, prompt, provider, model, image_object_key AS "imageObjectKey"
             FROM badge_generations
            WHERE id = $1 AND user_id = $2 AND status = 'preview'`,
          [generationId, userId],
        );
        const generation = generationResult.rows[0];
        if (!generation) return null;

        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM user_badges WHERE user_id = $1`,
          [userId],
        );
        if (countResult.rows[0].count >= maxBadges) return { limitExceeded: true };

        const badgeResult = await client.query(
          `INSERT INTO badges (title, description, image_object_key, provider, model, prompt, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${badgeColumns()}`,
          [title, description, generation.imageObjectKey, generation.provider, generation.model, generation.prompt, userId],
        );
        const badge = badgeResult.rows[0];
        await client.query(`INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)`, [userId, badge.id]);
        const activeResult = await client.query(
          `UPDATE users SET active_badge_id = $2 WHERE id = $1
           RETURNING active_badge_id AS "activeBadgeId"`,
          [userId, badge.id],
        );
        await client.query(`UPDATE badge_generations SET status = 'applied' WHERE id = $1`, [generationId]);
        return { ...badge, isActive: activeResult.rows[0]?.activeBadgeId === badge.id };
      });
    },

    async deleteUserBadge({ userId, badgeId }) {
      const result = await db.query(
        `WITH removed AS (
           DELETE FROM user_badges WHERE user_id = $1 AND badge_id = $2 RETURNING badge_id
         ), cleared AS (
           UPDATE users u SET active_badge_id = NULL FROM removed r
            WHERE u.id = $1 AND u.active_badge_id = r.badge_id RETURNING u.id
         )
         SELECT (SELECT COUNT(*)::int FROM removed) AS "removedCount",
                (SELECT COUNT(*)::int FROM cleared) AS "clearedCount"`,
        [userId, badgeId],
      );
      const row = result.rows[0];
      return { removed: row.removedCount > 0, clearedActive: row.clearedCount > 0 };
    },

    async setActiveBadge({ userId, badgeId }) {
      const result = await db.query(
        `UPDATE users u SET active_badge_id = $2
           FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
          WHERE u.id = $1 AND ub.user_id = $1 AND ub.badge_id = $2
        RETURNING ${badgeColumns('b')}, ub.awarded_at AS "awardedAt", true AS "isActive"`,
        [userId, badgeId],
      );
      return result.rows[0] ?? null;
    },

    async getActiveBadge(userId) {
      const result = await db.query(
        `SELECT ${badgeColumns('b')}, ub.awarded_at AS "awardedAt", true AS "isActive"
           FROM users u JOIN badges b ON b.id = u.active_badge_id
           JOIN user_badges ub ON ub.user_id = u.id AND ub.badge_id = b.id
          WHERE u.id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },

    async listUserBadges(userId) {
      const result = await db.query(
        `SELECT ${badgeColumns('b')}, ub.awarded_at AS "awardedAt",
                COALESCE(b.id = u.active_badge_id, false) AS "isActive"
           FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
           JOIN users u ON u.id = ub.user_id
          WHERE ub.user_id = $1 ORDER BY ub.awarded_at DESC`,
        [userId],
      );
      return result.rows;
    },
  };
}
