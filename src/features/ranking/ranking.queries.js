const RANKING_LIMIT = 50;

export function createRankingQueries(db) {
  return {
    async getAllTimeRanking() {
      const result = await db.query(
        `
          SELECT
            u.id,
            u.nickname,
            u.total_points AS "points",
            b.image_object_key AS "activeBadgeObjectKey"
          FROM users u
          LEFT JOIN badges b ON b.id = u.active_badge_id
          ORDER BY u.total_points DESC, u.created_at ASC
          LIMIT $1
        `,
        [RANKING_LIMIT],
      );

      return withRank(result.rows);
    },

    async getMonthlyRanking({ start, end }) {
      const result = await db.query(
        `
          SELECT
            u.id,
            u.nickname,
            COALESCE(SUM(pl.amount), 0)::integer AS "points",
            b.image_object_key AS "activeBadgeObjectKey"
          FROM users u
          LEFT JOIN badges b ON b.id = u.active_badge_id
          JOIN point_logs pl ON pl.user_id = u.id
          WHERE pl.created_at >= $1
            AND pl.created_at < $2
          GROUP BY u.id, b.image_object_key
          ORDER BY "points" DESC, MIN(pl.created_at) ASC
          LIMIT $3
        `,
        [start, end, RANKING_LIMIT],
      );

      return withRank(result.rows);
    },
  };
}

function withRank(rows) {
  return rows.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));
}
