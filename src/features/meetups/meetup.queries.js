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
            COALESCE(attendee_summary.participant_count, 0)::int AS "participantCount",
            (
              m.host_id = $1
              OR EXISTS (
                SELECT 1
                FROM participants joined_participant
                WHERE joined_participant.meetup_id = m.id
                  AND joined_participant.user_id = $1
              )
            ) AS "joined",
            (m.host_id = $1) AS "isHost",
            COALESCE(attendee_summary.attendees, '[]') AS attendees
          FROM meetups m
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*)::int AS participant_count,
              json_agg(
                json_build_object(
                  'id', attendee.id,
                  'name', attendee.nickname,
                  'badgeKey', attendee.image_object_key,
                  'isHost', attendee.id = m.host_id
                )
                ORDER BY (attendee.id = m.host_id) DESC, attendee.nickname
              ) AS attendees
            FROM (
              SELECT u.id, u.nickname, b.image_object_key
              FROM users u
              LEFT JOIN badges b ON b.id = u.active_badge_id
              WHERE u.id = m.host_id

              UNION

              SELECT u.id, u.nickname, b.image_object_key
              FROM participants p
              JOIN users u ON u.id = p.user_id
              LEFT JOIN badges b ON b.id = u.active_badge_id
              WHERE p.meetup_id = m.id
            ) attendee
          ) attendee_summary ON true
          WHERE m.status = 'open'
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
