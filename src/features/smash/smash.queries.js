export function createSmashQueries(db) {
  return {
    async getFlag(key) {
      const result = await db.query(
        `
          SELECT
            f.value,
            f.updated_at AS "updatedAt",
            u.nickname AS "updatedByName"
          FROM app_flags f
          LEFT JOIN users u ON u.id = f.updated_by
          WHERE f.key = $1
        `,
        [key],
      );

      return result.rows[0] ?? null;
    },

    // 현재 값의 반대로 뒤집고 결과를 반환한다 (단일 문장이라 동시 토글에도 안전).
    async toggleFlag({ key, userId }) {
      const result = await db.query(
        `
          INSERT INTO app_flags (key, value, updated_by, updated_at)
          VALUES ($1, true, $2, now())
          ON CONFLICT (key)
          DO UPDATE SET
            value = NOT app_flags.value,
            updated_by = $2,
            updated_at = now()
          RETURNING value, updated_at AS "updatedAt"
        `,
        [key, userId],
      );

      return result.rows[0];
    },
  };
}
