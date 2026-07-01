export function createMembersQueries(db) {
  return {
    async upsertMembers(client, members, sourceUrl) {
      if (members.length === 0) return 0;

      const values = [];
      const params = [sourceUrl];

      members.forEach(({ name, bio, face_id, avatar_url }, i) => {
        const base = i * 4 + 2;
        values.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $1, now(), now())`);
        params.push(name, bio ?? '', face_id ?? null, avatar_url ?? null);
      });

      const result = await client.query(
        `
          INSERT INTO somoim_members (name, bio, face_id, avatar_url, source_url, created_at, updated_at)
          VALUES ${values.join(', ')}
          ON CONFLICT (name, source_url)
          DO UPDATE SET
            bio = EXCLUDED.bio,
            face_id = COALESCE(EXCLUDED.face_id, somoim_members.face_id),
            avatar_url = COALESCE(EXCLUDED.avatar_url, somoim_members.avatar_url),
            updated_at = now()
          RETURNING id, name, avatar_url
        `,
        params,
      );

      if (result.rows.length > 0) {
        const userValues = result.rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, 'somoim', 0)`);
        const userParams = result.rows.flatMap(({ id, name, avatar_url }) => [id, name, avatar_url]);
        await client.query(
          `
            INSERT INTO users (id, nickname, avatar, oauth_provider, total_points)
            VALUES ${userValues.join(', ')}
            ON CONFLICT (id) DO UPDATE SET
              nickname = EXCLUDED.nickname,
              avatar = COALESCE(EXCLUDED.avatar, users.avatar)
          `,
          userParams,
        );
      }

      return result.rowCount;
    },

    async insertSyncLog(client, { sourceUrl, expectedCount, crawledCount, upsertedCount, status, errorMessage }) {
      const result = await client.query(
        `
          INSERT INTO somoim_sync_logs
            (source_url, expected_count, crawled_count, upserted_count, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [sourceUrl, expectedCount ?? null, crawledCount ?? null, upsertedCount, status, errorMessage ?? null],
      );

      return result.rows[0].id;
    },

    async listMembers() {
      const result = await db.query(
        `
          SELECT
            id,
            name,
            bio,
            avatar_url AS "avatarUrl",
            source_url AS "sourceUrl",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM somoim_members
          ORDER BY name ASC
        `,
      );

      return result.rows;
    },

    // 정모 하나를 UPSERT 하고, 참가자 목록을 교체(delete + insert)한다.
    async upsertEvent(client, event, sourceUrl) {
      const result = await client.query(
        `
          INSERT INTO somoim_events
            (source_url, title, scheduled_at, location, cost, joined_count, capacity, thumbnail_url, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (source_url, title, scheduled_at)
          DO UPDATE SET
            location = EXCLUDED.location,
            cost = EXCLUDED.cost,
            joined_count = EXCLUDED.joined_count,
            capacity = EXCLUDED.capacity,
            thumbnail_url = EXCLUDED.thumbnail_url,
            updated_at = now()
          RETURNING id
        `,
        [
          sourceUrl,
          event.title,
          event.scheduledAt,
          event.location,
          event.cost,
          event.joinedCount,
          event.capacity,
          event.thumbnailUrl,
        ],
      );

      const eventId = result.rows[0].id;

      // 참가자 목록 교체 (재크롤링 시 최신 상태 반영).
      await client.query(`DELETE FROM somoim_event_attendees WHERE event_id = $1`, [eventId]);

      if (event.attendees.length > 0) {
        const values = [];
        const params = [eventId];
        event.attendees.forEach(({ faceId, name }, i) => {
          const base = i * 2 + 2;
          values.push(`($1, $${base}, $${base + 1})`);
          params.push(faceId, name ?? null);
        });
        await client.query(
          `
            INSERT INTO somoim_event_attendees (event_id, face_id, member_name)
            VALUES ${values.join(', ')}
            ON CONFLICT (event_id, face_id) DO UPDATE SET member_name = EXCLUDED.member_name
          `,
          params,
        );
      }

      return eventId;
    },

    async listEvents() {
      const result = await db.query(
        `
          SELECT
            e.id,
            e.title,
            e.scheduled_at AS "scheduledAt",
            e.location,
            e.cost,
            e.joined_count AS "joinedCount",
            e.capacity,
            e.thumbnail_url AS "thumbnailUrl",
            COALESCE(
              json_agg(
                json_build_object('faceId', a.face_id, 'name', a.member_name)
                ORDER BY a.member_name NULLS LAST
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'
            ) AS attendees
          FROM somoim_events e
          LEFT JOIN somoim_event_attendees a ON a.event_id = e.id
          GROUP BY e.id
          ORDER BY e.scheduled_at ASC NULLS LAST
        `,
      );

      return result.rows;
    },

    async listSyncLogs(limit = 20) {
      const result = await db.query(
        `
          SELECT
            id,
            source_url AS "sourceUrl",
            expected_count AS "expectedCount",
            crawled_count AS "crawledCount",
            upserted_count AS "upsertedCount",
            status,
            error_message AS "errorMessage",
            synced_at AS "syncedAt"
          FROM somoim_sync_logs
          ORDER BY synced_at DESC
          LIMIT $1
        `,
        [limit],
      );

      return result.rows;
    },
  };
}
