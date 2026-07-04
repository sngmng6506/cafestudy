import cron from 'node-cron';
import { createMembersRouter } from './members.routes.js';
import { createMembersQueries } from './members.queries.js';
import { createMembersService } from './members.service.js';
import { crawlMembers } from './members.crawler.js';

export default {
  name: 'members',
  basePath: '/api/members',
  createRoutes: (ctx) => createMembersRouter(ctx),

  // loadFeatures.js가 onLoad를 await 없이 호출하므로 동기 함수여야 함
  onLoad: (ctx) => {
    const url = process.env.SOMOIM_URL;
    if (!url || process.env.NODE_ENV === 'test') return;

    const schedule = process.env.CRAWL_SCHEDULE ?? '0 2 * * *';
    if (!cron.validate(schedule)) {
      console.error(`[members] 유효하지 않은 CRAWL_SCHEDULE: "${schedule}"`);
      return;
    }

    const queries = createMembersQueries(ctx.db);
    const service = createMembersService(ctx.db, queries);

    let isRunning = false;
    cron.schedule(schedule, async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        console.log(`[members] 크롤링 시작: ${url}`);
        const result = await crawlMembers(url);
        const { upsertedCount, prunedMemberCount, eventCount, prunedCount, logId } =
          await service.syncMembers(result);
        console.log(
          `[members] 동기화 완료: ${upsertedCount}명 upserted (나간 멤버 ${prunedMemberCount}명 정리), 정모 ${eventCount}건 (유령 ${prunedCount}건 정리, logId: ${logId})`,
        );
        if (eventCount === 0) {
          console.warn('[members] 정모 0건 — 파싱 실패 가능성, 페이지 구조 변경 여부 확인 필요');
        }
      } catch (err) {
        console.error('[members] 크롤링/동기화 오류:', err.message);
      } finally {
        isRunning = false;
      }
    }, { timezone: 'Asia/Seoul' });

    console.log(`[members] 자동 크롤링 스케줄 등록: "${schedule}" (Asia/Seoul)`);
  },
};
