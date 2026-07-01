export function createCafesQueries(db) {
  return {
    async listInternalCafeVisits(userId) {
      const result = await db.query(
        `
          SELECT
            m.location,
            COUNT(DISTINCT m.id)::int AS "meetupCount",
            MAX(m.scheduled_at) AS "lastVisitedAt",
            COALESCE(BOOL_OR(p.user_id = $1), false) AS "canComment"
          FROM meetups m
          LEFT JOIN participants p ON p.meetup_id = m.id
          WHERE m.status = 'open'
            AND m.scheduled_at <= now()
          GROUP BY m.location
        `,
        [userId ?? null],
      );

      return result.rows;
    },

    async listSomoimCafeVisits(userId) {
      const result = await db.query(
        `
          SELECT
            e.location,
            COUNT(DISTINCT e.id)::int AS "meetupCount",
            MAX(e.scheduled_at) AS "lastVisitedAt",
            COALESCE(BOOL_OR(sm.id = $1), false) AS "canComment"
          FROM somoim_events e
          LEFT JOIN somoim_event_attendees a ON a.event_id = e.id
          LEFT JOIN somoim_members sm ON sm.face_id = a.face_id
          WHERE e.location IS NOT NULL
            AND e.location <> ''
            AND e.scheduled_at <= now()
          GROUP BY e.location
        `,
        [userId ?? null],
      );

      return result.rows;
    },

    async listComments(userId) {
      const result = await db.query(
        `
          SELECT
            c.id,
            c.cafe_location AS location,
            c.body,
            c.created_at AS "createdAt",
            c.updated_at AS "updatedAt",
            u.nickname AS "authorName",
            c.user_id = $1 AS "isMine"
          FROM cafe_comments c
          JOIN users u ON u.id = c.user_id
          ORDER BY c.updated_at DESC
        `,
        [userId ?? null],
      );

      return result.rows;
    },

    async hasVisitedCafe({ userId, location }) {
      const result = await db.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM meetups m
            JOIN participants p ON p.meetup_id = m.id
            WHERE m.location = $2
              AND m.status = 'open'
              AND m.scheduled_at <= now()
              AND p.user_id = $1
          ) OR EXISTS (
            SELECT 1
            FROM somoim_events e
            JOIN somoim_event_attendees a ON a.event_id = e.id
            JOIN somoim_members sm ON sm.face_id = a.face_id
            WHERE e.location = $2
              AND e.scheduled_at <= now()
              AND sm.id = $1
          ) AS allowed
        `,
        [userId, location],
      );

      return result.rows[0]?.allowed ?? false;
    },

    async upsertComment({ userId, location, body }) {
      const result = await db.query(
        `
          INSERT INTO cafe_comments (cafe_location, user_id, body)
          VALUES ($1, $2, $3)
          ON CONFLICT (cafe_location, user_id)
          DO UPDATE SET body = EXCLUDED.body, updated_at = now()
          RETURNING
            id,
            cafe_location AS location,
            body,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [location, userId, body],
      );

      return result.rows[0];
    },
  };
}
