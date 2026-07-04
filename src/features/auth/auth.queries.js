export function createAuthQueries(db) {
  return {
    async getAuthUserById(id) {
      const result = await db.query(
        `SELECT id, nickname, password_hash AS "passwordHash", is_admin AS "isAdmin"
           FROM users WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async setPassword(id, hash) {
      await db.query(
        `UPDATE users SET password_hash = $2, password_updated_at = now() WHERE id = $1`,
        [id, hash],
      );
    },

    // 비밀번호를 지우고(초기화), 대상의 모든 세션을 무효화한다.
    async clearPassword(id) {
      await db.transaction(async (client) => {
        await client.query(
          `UPDATE users SET password_hash = NULL, password_updated_at = now() WHERE id = $1`,
          [id],
        );
        await client.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      });
    },

    async insertSession(token, userId, expiresAt) {
      await db.query(
        `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
        [token, userId, expiresAt],
      );
    },

    async deleteSession(token) {
      await db.query(`DELETE FROM sessions WHERE token = $1`, [token]);
    },
  };
}
