export function createGame2048Queries(db) {
  return {
    // 기존보다 높을 때만 갱신하는 upsert. GREATEST로 낮은 점수 제출은 무시.
    async upsertBest(userId, score) {
      const result = await db.query(
        `
          INSERT INTO game2048_scores (user_id, best_score, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (user_id) DO UPDATE
            SET best_score = GREATEST(game2048_scores.best_score, EXCLUDED.best_score),
                updated_at = CASE
                  WHEN EXCLUDED.best_score > game2048_scores.best_score THEN now()
                  ELSE game2048_scores.updated_at
                END
          RETURNING best_score AS "bestScore"
        `,
        [userId, score],
      );
      return result.rows[0].bestScore;
    },

    async getMyBest(userId) {
      const result = await db.query(
        `SELECT best_score AS "bestScore" FROM game2048_scores WHERE user_id = $1`,
        [userId],
      );
      return result.rows[0]?.bestScore ?? 0;
    },

    async getRanking(limit) {
      const result = await db.query(
        `
          SELECT
            u.id,
            u.nickname,
            g.best_score AS "bestScore",
            b.image_object_key AS "activeBadgeObjectKey"
          FROM game2048_scores g
          JOIN users u ON u.id = g.user_id
          LEFT JOIN badges b ON b.id = u.active_badge_id
          WHERE g.best_score > 0
          ORDER BY g.best_score DESC, g.updated_at ASC
          LIMIT $1
        `,
        [limit],
      );
      return result.rows;
    },
  };
}
