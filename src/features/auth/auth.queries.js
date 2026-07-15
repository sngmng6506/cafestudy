export function createAuthQueries(db) {
  return {
    async getAuthUserById(id) {
      const result = await db.query(
        `SELECT
           u.id,
           u.nickname,
           u.password_hash AS "passwordHash",
           u.password_updated_at AS "passwordUpdatedAt",
           CASE
             WHEN ao.user_id IS NOT NULL THEN 'owner'
             WHEN u.admin_role = 'owner' THEN 'admin'
             ELSE COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END)
           END AS "adminRole"
         FROM users u
         LEFT JOIN app_owner ao ON ao.user_id = u.id
         WHERE u.id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async setInitialPassword(id, hash) {
      const result = await db.query(
        `UPDATE users
         SET password_hash = $2, password_updated_at = now()
         WHERE id = $1
           AND password_hash IS NULL
           AND password_updated_at IS NULL
         RETURNING id`,
        [id, hash],
      );
      return result.rowCount > 0;
    },

    async consumeSetupToken({ userId, tokenHash, passwordHash }) {
      return db.transaction(async (client) => {
        const tokenResult = await client.query(
          `UPDATE password_setup_tokens
           SET used_at = now()
           WHERE token_hash = $1
             AND user_id = $2
             AND used_at IS NULL
             AND expires_at > now()
           RETURNING token_hash`,
          [tokenHash, userId],
        );
        if (tokenResult.rowCount === 0) return false;

        await client.query(
          `UPDATE users
           SET password_hash = $2, password_updated_at = now()
           WHERE id = $1`,
          [userId, passwordHash],
        );
        await client.query(
          `DELETE FROM password_setup_tokens
           WHERE user_id = $1 AND token_hash <> $2`,
          [userId, tokenHash],
        );
        return true;
      });
    },

    async createPasswordSetupToken({ userId, createdBy, tokenHash, expiresAt }) {
      await db.transaction(async (client) => {
        await client.query(
          `DELETE FROM password_setup_tokens WHERE user_id = $1`,
          [userId],
        );
        await client.query(
          `UPDATE users
           SET password_hash = NULL, password_updated_at = now()
           WHERE id = $1`,
          [userId],
        );
        await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
        await client.query(
          `INSERT INTO password_setup_tokens
             (token_hash, user_id, created_by, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [tokenHash, userId, createdBy, expiresAt],
        );
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
