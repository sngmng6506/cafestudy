export function createMeetupQueries(db) {
  return {
    async listMeetups(userId) {
      const result = await db.query(
        `
          SELECT
            m.id,
            m.host_id AS "hostId",
            m.title,
            m.description,
            m.location,
            m.scheduled_at AS "scheduledAt",
            m.status,
            m.capacity,
            m.created_at AS "createdAt",
            COUNT(p.user_id)::int AS "participantCount",
            COALESCE(BOOL_OR(p.user_id = $1), false) AS "joined",
            (m.host_id = $1) AS "isHost",
            COALESCE(
              json_agg(
                json_build_object('name', u.nickname)
                ORDER BY u.nickname
              ) FILTER (WHERE u.id IS NOT NULL),
              '[]'
            ) AS attendees
          FROM meetups m
          LEFT JOIN participants p ON p.meetup_id = m.id
          LEFT JOIN users u ON u.id = p.user_id
          WHERE m.status = 'open'
          GROUP BY m.id
          ORDER BY m.scheduled_at ASC, m.created_at DESC
        `,
        [userId ?? null],
      );

      return result.rows;
    },

    // Creates the meetup and enrolls the host as a participant in one transaction.
    createMeetup({ hostId, title, description, location, scheduledAt, capacity }) {
      return db.transaction(async (client) => {
        const result = await client.query(
          `
            INSERT INTO meetups (host_id, title, description, location, scheduled_at, capacity, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'open')
            RETURNING
              id,
              host_id AS "hostId",
              title,
              description,
              location,
              scheduled_at AS "scheduledAt",
              status,
              capacity,
              created_at AS "createdAt"
          `,
          [hostId, title, description, location, scheduledAt, capacity],
        );

        const meetup = result.rows[0];

        await client.query(
          `
            INSERT INTO participants (meetup_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (meetup_id, user_id) DO NOTHING
          `,
          [meetup.id, hostId],
        );

        return meetup;
      });
    },

    async getMeetupById(meetupId) {
      const result = await db.query(
        `
          SELECT id, host_id AS "hostId", scheduled_at AS "scheduledAt", status, capacity
          FROM meetups
          WHERE id = $1
        `,
        [meetupId],
      );

      return result.rows[0];
    },

    async cancelMeetup(meetupId) {
      await db.query(`UPDATE meetups SET status = 'closed' WHERE id = $1`, [meetupId]);
    },

    async addParticipant(meetupId, userId) {
      await db.query(
        `
          INSERT INTO participants (meetup_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (meetup_id, user_id) DO NOTHING
        `,
        [meetupId, userId],
      );
    },

    async removeParticipant(meetupId, userId) {
      await db.query(
        `DELETE FROM participants WHERE meetup_id = $1 AND user_id = $2`,
        [meetupId, userId],
      );
    },

    async countParticipants(meetupId) {
      const result = await db.query(
        `SELECT COUNT(*)::int AS count FROM participants WHERE meetup_id = $1`,
        [meetupId],
      );

      return result.rows[0].count;
    },
  };
}
