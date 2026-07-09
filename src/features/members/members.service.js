import { throwValidation } from '../../shared/errors.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';
import { crawlMembers } from './members.crawler.js';

// 갱신 버튼 쿨타임(ms). 이 시간 안에는 재크롤링을 거부한다.
// 서버 전역 상태라 모든 사용자가 쿨타임을 공유한다(동시 남용 방지).
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export function createMembersService(db, queries, storage) {
  // 마지막 갱신 성공 시각 + 진행 중 플래그. 모듈이 아니라 서비스 인스턴스 스코프.
  // (서버 재시작 시 리셋되지만, 재시작 직후엔 어차피 크롤링이 한 번 도므로 무방)
  let lastRefreshAt = 0;
  let refreshing = false;

  const service = {
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
      return attachBadgeImageUrls(
        storage,
        members.map(({ avatarUrl, ...member }) => member),
      );
    },

    async getMemberAvatarUrl(memberId) {
      return queries.getMemberAvatarUrl(memberId);
    },

    async getMemberStats(memberId) {
      return queries.getMemberStats(memberId);
    },

    async listEvents() {
      const events = await queries.listEvents();
      return Promise.all(
        events.map(async (event) => ({
          ...event,
          attendees: await attachBadgeImageUrls(storage, event.attendees, {
            keyField: 'badgeKey',
            urlField: 'badgeUrl',
          }),
        })),
      );
    },

    async listSyncLogs() {
      return queries.listSyncLogs();
    },

    // 현재 쿨타임 상태. 프론트가 버튼 초기 상태를 그리는 데 쓴다.
    getRefreshStatus() {
      const now = Date.now();
      const readyAt = lastRefreshAt + REFRESH_COOLDOWN_MS;
      const remainingMs = Math.max(0, readyAt - now);
      return {
        refreshing,
        cooldownMs: REFRESH_COOLDOWN_MS,
        remainingMs,
        readyAt: remainingMs > 0 ? new Date(readyAt).toISOString() : null,
      };
    },

    // 소모임을 실제로 크롤링해서 동기화. cron과 갱신 버튼이 공유한다.
    // 쿨타임/중복 실행을 서버에서 강제하므로, 여러 사용자가 동시에 눌러도
    // 실제 크롤링은 5분에 한 번만 일어난다.
    async refreshFromSomoim(url, { force = false } = {}) {
      if (!url) throwValidation('SOMOIM_URL이 설정되지 않았습니다');

      const now = Date.now();
      const readyAt = lastRefreshAt + REFRESH_COOLDOWN_MS;

      if (refreshing) {
        return { status: 'in_progress', ...service.getRefreshStatus() };
      }
      if (!force && now < readyAt) {
        return { status: 'cooldown', ...service.getRefreshStatus() };
      }

      refreshing = true;
      try {
        const crawled = await crawlMembers(url);
        const result = await service.syncMembers(crawled);
        lastRefreshAt = Date.now(); // 성공한 시점부터 쿨타임 시작
        console.log(
          `[members] 갱신 완료(버튼): ${result.upsertedCount}명 upserted, 정모 ${result.eventCount}건` +
            ` (크롤 원본 정모 ${crawled.events?.length ?? 0}건, 멤버 ${crawled.members?.length ?? 0}명)`,
        );
        if (result.eventCount === 0) {
          console.warn('[members] 갱신 결과 정모 0건 — 소모임에 정모가 없거나 파싱 실패 가능성');
        }
        return { status: 'ok', ...result, ...service.getRefreshStatus() };
      } finally {
        refreshing = false;
      }
    },
  };

  return service;
}
