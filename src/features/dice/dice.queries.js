export function createDiceQueries(db) {
  return {
    awardPoints({ userId, amount }) {
      return db.transaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO point_logs (user_id, source, ref_id, amount)
           VALUES ($1, 'dice', gen_random_uuid(), $2)
           RETURNING id`,
          [userId, amount],
        );

        await client.query(
          `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
          [amount, userId],
        );

        return rows[0];
      });
    },

    async getMyPoints(userId) {
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(amount), 0)::integer AS points
         FROM point_logs
         WHERE user_id = $1 AND source = 'dice'`,
        [userId],
      );
      return rows[0].points;
    },

    async getRanking() {
      const { rows } = await db.query(
        `SELECT u.id, u.nickname, COALESCE(SUM(pl.amount), 0)::integer AS points,
                b.image_object_key AS "activeBadgeObjectKey"
         FROM users u
         LEFT JOIN badges b ON b.id = u.active_badge_id
         JOIN point_logs pl ON pl.user_id = u.id AND pl.source = 'dice'
         GROUP BY u.id, b.image_object_key
         ORDER BY points DESC, MIN(pl.created_at) ASC
         LIMIT 5`,
      );
      return rows.map((row, i) => ({ rank: i + 1, ...row }));
    },
  };
}
