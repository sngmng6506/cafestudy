export function createNoticesQueries(db) {
  return {
    async list(userId, { limit, offset = 0, summary = false }) {
      const result = await db.query(
        `SELECT
           n.id,
           n.title,
           CASE WHEN $2::boolean THEN left(n.body, 240) ELSE n.body END AS body,
           n.is_pinned AS "isPinned",
           n.published_at AS "publishedAt",
           n.updated_at AS "updatedAt",
           u.nickname AS "authorName",
           (nr.user_id IS NOT NULL) AS "isRead"
         FROM notices n
         JOIN users u ON u.id = n.created_by
         LEFT JOIN notice_reads nr ON nr.notice_id = n.id AND nr.user_id = $1
         ORDER BY
           CASE WHEN $2::boolean THEN false ELSE n.is_pinned END DESC,
           n.published_at DESC,
           n.id DESC
         LIMIT $3 OFFSET $4`,
        [userId, summary, limit, offset],
      );
      return result.rows;
    },

    async unreadCount(userId) {
      const result = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM notices n
         WHERE NOT EXISTS (
           SELECT 1 FROM notice_reads nr
           WHERE nr.notice_id = n.id AND nr.user_id = $1
         )`,
        [userId],
      );
      return result.rows[0].count;
    },

    async findById(id) {
      const result = await db.query(
        `SELECT id, title, body, is_pinned AS "isPinned", created_by AS "createdBy"
         FROM notices WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async create({ title, body, isPinned, createdBy }) {
      const result = await db.query(
        `INSERT INTO notices (title, body, is_pinned, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, body, is_pinned AS "isPinned", published_at AS "publishedAt"`,
        [title, body, isPinned, createdBy],
      );
      return result.rows[0];
    },

    async update(id, { title, body, isPinned }) {
      const result = await db.query(
        `UPDATE notices
         SET title = $2, body = $3, is_pinned = $4, updated_at = now()
         WHERE id = $1
         RETURNING id, title, body, is_pinned AS "isPinned", published_at AS "publishedAt", updated_at AS "updatedAt"`,
        [id, title, body, isPinned],
      );
      return result.rows[0] ?? null;
    },

    async remove(id) {
      const result = await db.query(`DELETE FROM notices WHERE id = $1`, [id]);
      return result.rowCount > 0;
    },

    async markRead(noticeId, userId) {
      await db.query(
        `INSERT INTO notice_reads (notice_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (notice_id, user_id) DO UPDATE SET read_at = now()`,
        [noticeId, userId],
      );
    },

    async markAllRead(userId) {
      await db.query(
        `INSERT INTO notice_reads (notice_id, user_id)
         SELECT id, $1 FROM notices
         ON CONFLICT (notice_id, user_id) DO UPDATE SET read_at = now()`,
        [userId],
      );
    },
  };
}
