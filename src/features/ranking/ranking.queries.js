const RANKING_LIMIT = 50;

export function createRankingQueries(db) {
  return {
    async getAllTimeRanking() {
      const result = await db.query(
        `
          SELECT
            id,
            nickname,
            avatar,
            total_points AS "points"
          FROM users
          ORDER BY total_points DESC, created_at ASC
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
            u.avatar,
            COALESCE(SUM(pl.amount), 0)::integer AS "points"
          FROM users u
          JOIN point_logs pl ON pl.user_id = u.id
          WHERE pl.created_at >= $1
            AND pl.created_at < $2
          GROUP BY u.id
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
