export function createMeetupQueries(db) {
  return {
    async listMeetups() {
      const result = await db.query(
        `
          SELECT
            id,
            host_id AS "hostId",
            title,
            cafe_name AS "cafeName",
            location,
            scheduled_at AS "scheduledAt",
            status,
            created_at AS "createdAt"
          FROM meetups
          WHERE status = 'open'
          ORDER BY scheduled_at ASC, created_at DESC
        `,
      );

      return result.rows;
    },

    async createMeetup({ hostId, title, cafeName, location, scheduledAt }) {
      const result = await db.query(
        `
          INSERT INTO meetups (host_id, title, cafe_name, location, scheduled_at, status)
          VALUES ($1, $2, $3, $4, $5, 'open')
          RETURNING
            id,
            host_id AS "hostId",
            title,
            cafe_name AS "cafeName",
            location,
            scheduled_at AS "scheduledAt",
            status,
            created_at AS "createdAt"
        `,
        [hostId, title, cafeName, location, scheduledAt],
      );

      return result.rows[0];
    },
  };
}
