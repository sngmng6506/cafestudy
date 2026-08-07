import cron from 'node-cron';
import { createMembersRouter } from './members.routes.js';
import { createMembersQueries } from './members.queries.js';
import { createMembersService } from './members.service.js';

let sharedService;
function getService(ctx) {
  if (!sharedService) {
    const queries = createMembersQueries(ctx.db);
    sharedService = createMembersService(ctx.db, queries, ctx.storage, {
      refreshCooldownMs: ctx.config?.members?.refreshCooldownMs,
      crawlerOptions: {
        executablePath: ctx.config?.members?.puppeteerExecutablePath,
      },
    });
  }
  return sharedService;
}

export default {
  name: 'members',
  basePath: '/api/members',
  createRoutes: (ctx) => createMembersRouter(ctx, getService(ctx)),

  onLoad: (ctx) => {
    const membersConfig = ctx.config?.members ?? {};
    const url = membersConfig.somoimUrl;
    if (!url || ctx.config?.env === 'test') return;

    const schedule = membersConfig.crawlSchedule ?? '0 2,18 * * *';
    if (!cron.validate(schedule)) {
      console.error(`[members] 유효하지 않은 CRAWL_SCHEDULE: "${schedule}"`);
      return;
    }

    const service = getService(ctx);
    cron.schedule(
      schedule,
      async () => {
        try {
          const result = await service.refreshFromSomoim(url, { force: true });
          if (result.status !== 'ok') return;
          if (result.eventCount === 0) {
            console.warn('[members] 정모 0건 — 파싱 실패 가능성, 페이지 구조 변경 여부 확인 필요');
          }
        } catch (err) {
          console.error('[members] 크롤링/동기화 오류:', err.message);
        }
      },
      { timezone: 'Asia/Seoul' },
    );
  },
};
