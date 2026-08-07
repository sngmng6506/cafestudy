import { throwValidation } from '../../shared/errors.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';
import { crawlMembers } from './members.crawler.js';

export function createMembersService(db, queries, storage, options = {}) {
  const refreshCooldownMs = options.refreshCooldownMs ?? 5 * 60 * 1000;
  const crawlMembersFn = options.crawlMembersFn ?? crawlMembers;
  const crawlerOptions = options.crawlerOptions ?? {};
  let lastRefreshAt = 0;
  let refreshing = false;

  const service = {
    async syncMembers({ url, expected_member_count, crawled_member_count, members, events }) {
      if (!url || !Array.isArray(members)) throwValidation('url과 members 배열이 필요합니다');
      let upsertedCount = 0;
      let prunedMemberCount = 0;
      let eventCount = 0;
      let prunedCount = 0;
      let logId;

      try {
        await db.transaction(async (client) => {
          const { count, ids } = await queries.upsertMembers(client, members, url);
          upsertedCount = count;
          if (ids.length > 0) prunedMemberCount = await queries.pruneStaleMembers(client, url, ids);

          if (Array.isArray(events)) {
            const keepIds = [];
            for (const event of events) {
              keepIds.push(await queries.upsertEvent(client, event, url));
              eventCount += 1;
            }
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
          `INSERT INTO somoim_sync_logs
             (source_url, expected_count, crawled_count, upserted_count, status, error_message)
           VALUES ($1, $2, $3, 0, 'error', $4)`,
          [url, expected_member_count ?? null, crawled_member_count ?? null, err.message],
        );
        throw err;
      }
      return { upsertedCount, prunedMemberCount, eventCount, prunedCount, logId };
    },

    async listMembers() {
      const members = await queries.listMembers();
      return attachBadgeImageUrls(storage, members.map(({ avatarUrl, ...member }) => member));
    },
    async getMemberAvatarUrl(memberId) { return queries.getMemberAvatarUrl(memberId); },
    async getMemberStats(memberId) { return queries.getMemberStats(memberId); },
    async listEvents() {
      const events = await queries.listEvents();
      return Promise.all(events.map(async (event) => ({
        ...event,
        attendees: await attachBadgeImageUrls(storage, event.attendees, {
          keyField: 'badgeKey',
          urlField: 'badgeUrl',
        }),
      })));
    },
    async listSyncLogs() { return queries.listSyncLogs(); },

    getRefreshStatus() {
      const readyAt = lastRefreshAt + refreshCooldownMs;
      const remainingMs = Math.max(0, readyAt - Date.now());
      return {
        refreshing,
        cooldownMs: refreshCooldownMs,
        remainingMs,
        readyAt: remainingMs > 0 ? new Date(readyAt).toISOString() : null,
      };
    },

    async refreshFromSomoim(url, { force = false } = {}) {
      if (!url) throwValidation('SOMOIM_URL이 설정되지 않았습니다');
      const readyAt = lastRefreshAt + refreshCooldownMs;
      if (refreshing) return { status: 'in_progress', ...service.getRefreshStatus() };
      if (!force && Date.now() < readyAt) return { status: 'cooldown', ...service.getRefreshStatus() };

      refreshing = true;
      try {
        const crawled = await crawlMembersFn(url, crawlerOptions);
        const result = await service.syncMembers(crawled);
        lastRefreshAt = Date.now();
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
