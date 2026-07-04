export function createBadgesQueries(db) {
  return {
    async createGeneration({ userId, prompt, provider, model, imageObjectKey, pointCost }) {
      const result = await db.query(
        `
          INSERT INTO badge_generations (user_id, prompt, provider, model, image_object_key, point_cost)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
            id,
            user_id AS "userId",
            prompt,
            provider,
            model,
            image_object_key AS "imageObjectKey",
            point_cost AS "pointCost",
            status,
            created_at AS "createdAt"
        `,
        [userId, prompt, provider, model, imageObjectKey, pointCost],
      );

      return result.rows[0];
    },

    async getGenerationForUser({ generationId, userId }) {
      const result = await db.query(
        `
          SELECT
            id,
            user_id AS "userId",
            prompt,
            provider,
            model,
            image_object_key AS "imageObjectKey",
            point_cost AS "pointCost",
            status,
            created_at AS "createdAt"
          FROM badge_generations
          WHERE id = $1
            AND user_id = $2
        `,
        [generationId, userId],
      );

      return result.rows[0];
    },

    async createBadgeFromGeneration({ userId, generationId, title, description }) {
      return db.transaction(async (client) => {
        const generationResult = await client.query(
          `
            SELECT id, prompt, provider, model, image_object_key AS "imageObjectKey"
            FROM badge_generations
            WHERE id = $1
              AND user_id = $2
              AND status = 'preview'
          `,
          [generationId, userId],
        );
        const generation = generationResult.rows[0];
        if (!generation) return null;

        const badgeResult = await client.query(
          `
            INSERT INTO badges (title, description, image_object_key, provider, model, prompt, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
              id,
              title,
              description,
              image_object_key AS "imageObjectKey",
              provider,
              model,
              prompt,
              created_at AS "createdAt",
              true AS "isActive"
          `,
          [
            title,
            description,
            generation.imageObjectKey,
            generation.provider,
            generation.model,
            generation.prompt,
            userId,
          ],
        );
        const badge = badgeResult.rows[0];

        await client.query(
          `
            INSERT INTO user_badges (user_id, badge_id)
            VALUES ($1, $2)
          `,
          [userId, badge.id],
        );

        await client.query(
          `UPDATE users SET active_badge_id = $2 WHERE id = $1`,
          [userId, badge.id],
        );

        await client.query(
          `UPDATE badge_generations SET status = 'applied' WHERE id = $1`,
          [generationId],
        );

        return badge;
      });
    },

    async setActiveBadge({ userId, badgeId }) {
      const result = await db.query(
        `
          UPDATE users u
          SET active_badge_id = $2
          WHERE u.id = $1
            AND EXISTS (
              SELECT 1
              FROM user_badges ub
              WHERE ub.user_id = $1
                AND ub.badge_id = $2
            )
          RETURNING active_badge_id AS "activeBadgeId"
        `,
        [userId, badgeId],
      );

      return result.rows[0] ?? null;
    },

    async getActiveBadge(userId) {
      const result = await db.query(
        `
          SELECT
            b.id,
            b.title,
            b.description,
            b.image_object_key AS "imageObjectKey",
            b.provider,
            b.model,
            b.prompt,
            ub.awarded_at AS "awardedAt",
            b.created_at AS "createdAt",
            true AS "isActive"
          FROM users u
          JOIN badges b ON b.id = u.active_badge_id
          JOIN user_badges ub ON ub.user_id = u.id AND ub.badge_id = b.id
          WHERE u.id = $1
        `,
        [userId],
      );

      return result.rows[0] ?? null;
    },

    async listUserBadges(userId) {
      const result = await db.query(
        `
          SELECT
            b.id,
            b.title,
            b.description,
            b.image_object_key AS "imageObjectKey",
            b.provider,
            b.model,
            b.prompt,
            ub.awarded_at AS "awardedAt",
            b.created_at AS "createdAt",
            b.id = u.active_badge_id AS "isActive"
          FROM user_badges ub
          JOIN badges b ON b.id = ub.badge_id
          JOIN users u ON u.id = ub.user_id
          WHERE ub.user_id = $1
          ORDER BY ub.awarded_at DESC
        `,
        [userId],
      );

      return result.rows;
    },
  };
}
