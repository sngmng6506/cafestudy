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
            m.somoim_state AS "somoimState",
            m.somoim_job_id AS "somoimJobId",
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
            AND m.source_type = 'app'
            AND (m.somoim_state <> 'failed' OR m.host_id = $1)
          ORDER BY m.scheduled_at ASC, m.created_at DESC
        `,
        [userId ?? null],
      );

      return result.rows;
    },

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
              somoim_state AS "somoimState",
              somoim_job_id AS "somoimJobId",
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

    joinMeetup({ meetupId, userId }) {
      return db.transaction(async (client) => {
        const meetupResult = await client.query(
          `
            SELECT id, scheduled_at AS "scheduledAt", status, capacity, somoim_state AS "somoimState"
            FROM meetups
            WHERE id = $1
            FOR UPDATE
          `,
          [meetupId],
        );
        const meetup = meetupResult.rows[0];

        if (!meetup) return { outcome: 'not_found' };
        if (meetup.somoimState === 'pending' || meetup.somoimState === 'failed') {
          return { outcome: 'somoim_pending' };
        }
        if (meetup.status !== 'open' || new Date(meetup.scheduledAt).getTime() <= Date.now()) {
          return { outcome: 'closed' };
        }

        const participantResult = await client.query(
          `
            SELECT
              COUNT(*)::int AS count,
              BOOL_OR(user_id = $2) AS "alreadyJoined"
            FROM participants
            WHERE meetup_id = $1
          `,
          [meetupId, userId],
        );
        const participantCount = participantResult.rows[0].count;
        const alreadyJoined = participantResult.rows[0].alreadyJoined === true;

        if (alreadyJoined) return { outcome: 'joined', participantCount };
        if (participantCount >= meetup.capacity) {
          return { outcome: 'full', participantCount };
        }

        await client.query(
          `
            INSERT INTO participants (meetup_id, user_id)
            VALUES ($1, $2)
          `,
          [meetupId, userId],
        );

        return { outcome: 'joined', participantCount: participantCount + 1 };
      });
    },

    async getMeetupById(meetupId) {
      const result = await db.query(
        `
          SELECT id, host_id AS "hostId", title, description, location,
            scheduled_at AS "scheduledAt", status, capacity,
            somoim_state AS "somoimState"
          FROM meetups
          WHERE id = $1
        `,
        [meetupId],
      );
      return result.rows[0];
    },

    async setSomoimState({ meetupId, state, jobId = null, expectedState }) {
      const params = [meetupId, state, jobId];
      let expectedClause = '';
      if (expectedState !== undefined) {
        params.push(expectedState);
        expectedClause = ` AND somoim_state = $${params.length}`;
      }

      const result = await db.query(
        `UPDATE meetups
            SET somoim_state = $2,
                somoim_job_id = COALESCE($3, somoim_job_id)
          WHERE id = $1${expectedClause}
          RETURNING id, somoim_state AS "somoimState", somoim_job_id AS "somoimJobId"`,
        params,
      );
      return result.rows[0] ?? null;
    },

    async markSomoimFailedByJob(jobId) {
      const result = await db.query(
        `UPDATE meetups
            SET somoim_state = 'failed'
          WHERE somoim_job_id = $1 AND somoim_state = 'pending'
          RETURNING id, somoim_state AS "somoimState"`,
        [jobId],
      );
      return result.rows[0] ?? null;
    },

    async markSomoimRegisteredByJob(jobId) {
      const result = await db.query(
        `UPDATE meetups
            SET somoim_state = 'registered'
          WHERE somoim_job_id = $1 AND somoim_state = 'pending'
          RETURNING id, somoim_state AS "somoimState"`,
        [jobId],
      );
      return result.rows[0] ?? null;
    },

    async cancelMeetup(meetupId) {
      await db.query(`UPDATE meetups SET status = 'closed' WHERE id = $1`, [meetupId]);
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
