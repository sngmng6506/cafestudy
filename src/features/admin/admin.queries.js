export function createAdminQueries(db) {
  async function findUser(id, client = db) {
    const result = await client.query(
      `SELECT id, nickname,
              COALESCE(admin_role, CASE WHEN is_admin THEN 'admin' ELSE 'member' END) AS role
       FROM users WHERE id = $1`,
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
           COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END) AS role,
           (u.password_hash IS NOT NULL) AS "hasPassword"
         FROM users u
         JOIN somoim_members m ON m.id = u.id
         ORDER BY CASE COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END)
                    WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                  u.nickname ASC`,
      );
      return result.rows;
    },

    findUser,

    async updateRole({ targetUserId, changedBy, role }) {
      return db.transaction(async (client) => {
        const target = await findUser(targetUserId, client);
        if (!target) return null;
        if (target.role === role) return target;

        await client.query(
          `UPDATE users
           SET admin_role = $2, is_admin = ($2 IN ('admin', 'owner'))
           WHERE id = $1`,
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
