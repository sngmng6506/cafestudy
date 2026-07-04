import { throwValidation } from '../../shared/errors.js';
export function createMembersService(db, queries) {
  return {
    async syncMembers({ url, expected_member_count, crawled_member_count, members, events }) {
      if (!url || !Array.isArray(members)) {
        throwValidation('url과 members 배열이 필요합니다');
      }

      let upsertedCount = 0;
      let prunedMemberCount = 0;
      let eventCount = 0;
      let prunedCount = 0;
      let logId;

      try {
        await db.transaction(async (client) => {
          const { count, ids } = await queries.upsertMembers(client, members, url);
          upsertedCount = count;

          // 이번 크롤에 없는 멤버 정리 (소모임에서 나간 사람).
          // keepIds가 비면(크롤이 멤버 0명 = 파싱 실패 가능성) 오삭제 방지로 건너뛴다.
          // 정모의 pruneStaleFutureEvents와 동일한 가드 패턴.
          if (ids.length > 0) {
            prunedMemberCount = await queries.pruneStaleMembers(client, url, ids);
          }

          // 정모 일정 동기화 (있을 때만).
          if (Array.isArray(events)) {
            const keepIds = [];
            for (const event of events) {
              const eventId = await queries.upsertEvent(client, event, url);
              keepIds.push(eventId);
              eventCount += 1;
            }

            // 소모임에서 수정/삭제된 정모의 유령 행 정리.
            // 크롤링이 정모를 하나도 못 뽑은 경우(파싱 실패 가능성)는 오삭제를
            // 막기 위해 건너뛴다 — 이 경우 로그의 eventCount=0으로 감지한다.
            if (keepIds.length > 0) {
              prunedCount = await queries.pruneStaleFutureEvents(client, url, keepIds);
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

      return { upsertedCount, prunedMemberCount, eventCount, prunedCount, logId };
    },

    async listMembers() {
      const members = await queries.listMembers();
      return members.map(({ avatarUrl, ...member }) => member);
    },

    async getMemberAvatarUrl(memberId) {
      return queries.getMemberAvatarUrl(memberId);
    },

    async listEvents() {
      return queries.listEvents();
    },

    async listSyncLogs() {
      return queries.listSyncLogs();
    },
  };
}
