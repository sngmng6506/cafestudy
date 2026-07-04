// 뱃지 row의 공통 SELECT 컬럼. 세 쿼리(RETURNING 포함)가 같은 shape를
// 반환해야 클라이언트/서비스가 단일 형태로 다룰 수 있다.
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

        // 보유 수 제한. user row 잠금으로 같은 유저의 동시 적용을 직렬화해
        // 한도 초과를 막는다 (generate 단계의 사전 확인은 UX용일 뿐).
        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        const countResult = await client.query(
          `SELECT COUNT(*)::int AS count FROM user_badges WHERE user_id = $1`,
          [userId],
        );
        if (countResult.rows[0].count >= maxBadges) {
          return { limitExceeded: true };
        }

        const badgeResult = await client.query(
          `
            INSERT INTO badges (title, description, image_object_key, provider, model, prompt, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING ${badgeColumns()}
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

        // 새로 적용한 뱃지가 대표 뱃지가 된다. isActive는 단정하지 않고
        // 실제 UPDATE 결과에서 유도한다 (listUserBadges와 같은 진실 소스).
        const activeResult = await client.query(
          `UPDATE users SET active_badge_id = $2 WHERE id = $1 RETURNING active_badge_id AS "activeBadgeId"`,
          [userId, badge.id],
        );

        await client.query(
          `UPDATE badge_generations SET status = 'applied' WHERE id = $1`,
          [generationId],
        );

        return { ...badge, isActive: activeResult.rows[0]?.activeBadgeId === badge.id };
      });
    },

    async deleteUserBadge({ userId, badgeId }) {
      // 소유 행 삭제 + (그 뱃지가 대표였다면) 대표 뱃지 해제를 한 문장으로.
      // badges 원본 행과 이미지 오브젝트는 남긴다 (정리는 ROADMAP).
      const result = await db.query(
        `
          WITH removed AS (
            DELETE FROM user_badges
            WHERE user_id = $1 AND badge_id = $2
            RETURNING badge_id
          ), cleared AS (
            UPDATE users u
            SET active_badge_id = NULL
            FROM removed r
            WHERE u.id = $1 AND u.active_badge_id = r.badge_id
            RETURNING u.id
          )
          SELECT
            (SELECT COUNT(*)::int FROM removed) AS "removedCount",
            (SELECT COUNT(*)::int FROM cleared) AS "clearedCount"
        `,
        [userId, badgeId],
      );

      const row = result.rows[0];
      return { removed: row.removedCount > 0, clearedActive: row.clearedCount > 0 };
    },

    async setActiveBadge({ userId, badgeId }) {
      // 소유권 검증 + 갱신 + 뱃지 row 반환을 한 문장으로 처리한다.
      // (UPDATE 후 재조회 사이에 다른 요청이 끼어드는 레이스 방지)
      const result = await db.query(
        `
          UPDATE users u
          SET active_badge_id = $2
          FROM user_badges ub
          JOIN badges b ON b.id = ub.badge_id
          WHERE u.id = $1
            AND ub.user_id = $1
            AND ub.badge_id = $2
          RETURNING
            ${badgeColumns('b')},
            ub.awarded_at AS "awardedAt",
            true AS "isActive"
        `,
        [userId, badgeId],
      );

      return result.rows[0] ?? null;
    },

    async getActiveBadge(userId) {
      const result = await db.query(
        `
          SELECT
            ${badgeColumns('b')},
            ub.awarded_at AS "awardedAt",
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
            ${badgeColumns('b')},
            ub.awarded_at AS "awardedAt",
            COALESCE(b.id = u.active_badge_id, false) AS "isActive"
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
