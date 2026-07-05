export function createSmashQueries(db) {
  return {
    async getFlag(key) {
      const result = await db.query(
        `
          SELECT
            value,
            updated_at AS "updatedAt"
          FROM app_flags
          WHERE key = $1
        `,
        [key],
      );

      return result.rows[0] ?? null;
    },

    // 현재 값의 반대로 뒤집고 결과를 반환한다 (단일 문장이라 동시 토글에도 안전).
    // 조작자는 익명 — updated_by는 채우지 않는다.
    async toggleFlag({ key }) {
      const result = await db.query(
        `
          INSERT INTO app_flags (key, value, updated_at)
          VALUES ($1, true, now())
          ON CONFLICT (key)
          DO UPDATE SET
            value = NOT app_flags.value,
            updated_at = now()
          RETURNING value, updated_at AS "updatedAt"
        `,
        [key],
      );

      return result.rows[0];
    },
  };
}
