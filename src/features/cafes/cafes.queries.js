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
            CASE WHEN c.is_anonymous AND c.user_id IS DISTINCT FROM $1 THEN '익명'
                 ELSE u.nickname END AS "authorName",
            c.is_anonymous AS "isAnonymous",
            c.user_id = $1 AS "isMine"
          FROM cafe_comments c
          JOIN users u ON u.id = c.user_id
          ORDER BY c.updated_at DESC
        `,
        [userId ?? null],
      );

      return result.rows;
    },

    async listCafePlaces() {
      const result = await db.query(
        `
          SELECT
            location,
            place_name AS "placeName",
            road_address AS "roadAddress",
            lat,
            lng,
            resolved_at AS "resolvedAt"
          FROM cafe_places
        `,
      );

      return result.rows;
    },

    async upsertCafePlace({ location, placeName, roadAddress, lat, lng }) {
      const result = await db.query(
        `
          INSERT INTO cafe_places (location, place_name, road_address, lat, lng, resolved_at)
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (location)
          DO UPDATE SET
            place_name = EXCLUDED.place_name,
            road_address = EXCLUDED.road_address,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            resolved_at = now()
          RETURNING
            location,
            place_name AS "placeName",
            road_address AS "roadAddress",
            lat,
            lng,
            resolved_at AS "resolvedAt"
        `,
        [location, placeName, roadAddress, lat, lng],
      );

      return result.rows[0];
    },

    // 해당 카페(모임 장소)에서 찍힌 승인 인증 사진.
    // 사진 공개 범위는 verifications의 규칙과 동일하게, 요청자가 호스트이거나
    // 참여했던 모임의 사진만 보여준다 (6bdd551의 프라이버시 결정 유지).
    async listCafePhotos({ userId, location, limit = 12 }) {
      const result = await db.query(
        `
          SELECT
            v.id,
            v.photo_url AS "photoUrl",
            v.created_at AS "createdAt",
            m.title AS "meetupTitle"
          FROM verifications v
          JOIN meetups m ON m.id = v.meetup_id
          WHERE v.status = 'approved'
            AND m.location = $2
            AND (
              m.host_id = $1
              OR EXISTS (
                SELECT 1
                FROM participants p
                WHERE p.meetup_id = m.id
                  AND p.user_id = $1
              )
            )
          ORDER BY v.created_at DESC
          LIMIT $3
        `,
        [userId, location, limit],
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

    async upsertComment({ userId, location, body, isAnonymous }) {
      const result = await db.query(
        `
          INSERT INTO cafe_comments (cafe_location, user_id, body, is_anonymous)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (cafe_location, user_id)
          DO UPDATE SET body = EXCLUDED.body,
                        is_anonymous = EXCLUDED.is_anonymous,
                        updated_at = now()
          RETURNING
            id,
            cafe_location AS location,
            body,
            is_anonymous AS "isAnonymous",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [location, userId, body, isAnonymous],
      );

      return result.rows[0];
    },
  };
}
