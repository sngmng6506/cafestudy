export function createAdminQueries(db) {
  async function findUser(id, client = db, forUpdate = false) {
    const result = await client.query(
      `SELECT
         u.id,
         u.nickname,
         CASE
           WHEN ao.user_id IS NOT NULL THEN 'owner'
           WHEN u.admin_role = 'owner' THEN 'admin'
           ELSE COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END)
         END AS role
       FROM users u
       LEFT JOIN app_owner ao ON ao.user_id = u.id
       WHERE u.id = $1
       ${forUpdate ? 'FOR UPDATE OF u' : ''}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  return {
    async listUsers() {
      const result = await db.query(
        `SELECT
           u.id,
           u.nickname AS name,
           CASE
             WHEN ao.user_id IS NOT NULL THEN 'owner'
             WHEN u.admin_role = 'owner' THEN 'admin'
             ELSE COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END)
           END AS role,
           (u.password_hash IS NOT NULL) AS "hasPassword",
           (u.password_hash IS NULL AND u.password_updated_at IS NOT NULL) AS "requiresSetupToken"
         FROM users u
         JOIN somoim_members m ON m.id = u.id
         LEFT JOIN app_owner ao ON ao.user_id = u.id
         ORDER BY CASE
                    WHEN ao.user_id IS NOT NULL THEN 0
                    WHEN COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END) = 'admin' THEN 1
                    ELSE 2
                  END,
                  u.nickname ASC`,
      );
      return result.rows;
    },

    findUser,

    async updateRole({ targetUserId, changedBy, role }) {
      return db.transaction(async (client) => {
        const target = await findUser(targetUserId, client, true);
        if (!target) return null;
        if (target.role === 'owner' || target.role === role) return target;

        await client.query(
          `UPDATE users
           SET admin_role = $2, is_admin = ($2 = 'admin')
           WHERE id = $1
             AND NOT EXISTS (SELECT 1 FROM app_owner WHERE user_id = $1)`,
          [targetUserId, role],
        );
        await client.query(
          `INSERT INTO admin_role_logs
             (target_user_id, changed_by, previous_role, new_role)
           VALUES ($1, $2, $3, $4)`,
          [targetUserId, changedBy, target.role, role],
        );
        return { ...target, role };
      });
    },
  };
}
