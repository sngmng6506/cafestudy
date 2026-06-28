export function createMembersQueries(db) {
  return {
    async upsertMembers(client, members, sourceUrl) {
      if (members.length === 0) return 0;

      const values = [];
      const params = [sourceUrl];

      members.forEach(({ name, bio }, i) => {
        const base = i * 2 + 2;
        values.push(`($${base}, $${base + 1}, $1, now(), now())`);
        params.push(name, bio ?? '');
      });

      const result = await client.query(
        `
          INSERT INTO somoim_members (name, bio, source_url, created_at, updated_at)
          VALUES ${values.join(', ')}
          ON CONFLICT (name, source_url)
          DO UPDATE SET bio = EXCLUDED.bio, updated_at = now()
          RETURNING id, name
        `,
        params,
      );

      if (result.rows.length > 0) {
        const userValues = result.rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, 'somoim', 0)`);
        const userParams = result.rows.flatMap(({ id, name }) => [id, name]);
        await client.query(
          `
            INSERT INTO users (id, nickname, oauth_provider, total_points)
            VALUES ${userValues.join(', ')}
            ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname
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
          SELECT id, name, bio, source_url AS "sourceUrl", created_at AS "createdAt", updated_at AS "updatedAt"
          FROM somoim_members
          ORDER BY name ASC
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
