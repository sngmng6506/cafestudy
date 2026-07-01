export function createMembersService(db, queries) {
  return {
    async syncMembers({ url, expected_member_count, crawled_member_count, members, events }) {
      if (!url || !Array.isArray(members)) {
        throw Object.assign(new Error('url과 members 배열이 필요합니다'), { code: 'INVALID_PAYLOAD' });
      }

      let upsertedCount = 0;
      let eventCount = 0;
      let logId;

      try {
        await db.transaction(async (client) => {
          upsertedCount = await queries.upsertMembers(client, members, url);

          // 정모 일정 동기화 (있을 때만).
          if (Array.isArray(events)) {
            for (const event of events) {
              await queries.upsertEvent(client, event, url);
              eventCount += 1;
            }
          }

          logId = await queries.insertSyncLog(client, {
            sourceUrl: url,
            expectedCount: expected_member_count,
            crawledCount: crawled_member_count,
            upsertedCount,
            status: 'success',
          });
        });
      } catch (err) {
        await db.query(
          `INSERT INTO somoim_sync_logs (source_url, expected_count, crawled_count, upserted_count, status, error_message)
           VALUES ($1, $2, $3, 0, 'error', $4)`,
          [url, expected_member_count ?? null, crawled_member_count ?? null, err.message],
        );
        throw err;
      }

      return { upsertedCount, eventCount, logId };
    },

    async listMembers() {
      return queries.listMembers();
    },

    async listEvents() {
      return queries.listEvents();
    },

    async listSyncLogs() {
      return queries.listSyncLogs();
    },
  };
}
