import cron from 'node-cron';
import { createMembersRouter } from './members.routes.js';
import { createMembersQueries } from './members.queries.js';
import { createMembersService } from './members.service.js';

// 라우트(갱신 버튼 쿨타임)와 cron이 같은 서비스 인스턴스를 공유해야
// 쿨타임 상태가 한 곳에서 관리된다. ctx 기준으로 한 번만 생성해 재사용.
let sharedService;
function getService(ctx) {
  if (!sharedService) {
    const queries = createMembersQueries(ctx.db);
    sharedService = createMembersService(ctx.db, queries, ctx.storage);
  }
  return sharedService;
}

export default {
  name: 'members',
  basePath: '/api/members',
  createRoutes: (ctx) => createMembersRouter(ctx, getService(ctx)),

  // loadFeatures.js가 onLoad를 await 없이 호출하므로 동기 함수여야 함
  onLoad: (ctx) => {
    const url = process.env.SOMOIM_URL;
    if (!url || process.env.NODE_ENV === 'test') return;

    // 기본: 하루 두 번, 새벽 2시 + 오후 6시 (Asia/Seoul). CRAWL_SCHEDULE로 재정의 가능.
    const schedule = process.env.CRAWL_SCHEDULE ?? '0 2,18 * * *';
    if (!cron.validate(schedule)) {
      console.error(`[members] 유효하지 않은 CRAWL_SCHEDULE: "${schedule}"`);
      return;
    }

    const service = getService(ctx);

    cron.schedule(
      schedule,
      async () => {
        try {
          console.log(`[members] 크롤링 시작: ${url}`);
          // force=true: 정기 크롤링은 쿨타임 무시하고 무조건 실행.
          // (성공 시 쿨타임 시계도 갱신되어, 직후 사용자 갱신 버튼 중복을 막음)
          const result = await service.refreshFromSomoim(url, { force: true });
          if (result.status !== 'ok') {
            console.warn(`[members] 크롤링 건너뜀 (status: ${result.status})`);
            return;
          }
          const { upsertedCount, prunedMemberCount, eventCount, prunedCount, logId } = result;
          console.log(
            `[members] 동기화 완료: ${upsertedCount}명 upserted (나간 멤버 ${prunedMemberCount}명 정리), 정모 ${eventCount}건 (유령 ${prunedCount}건 정리, logId: ${logId})`,
          );
          if (eventCount === 0) {
            console.warn('[members] 정모 0건 — 파싱 실패 가능성, 페이지 구조 변경 여부 확인 필요');
          }
        } catch (err) {
          console.error('[members] 크롤링/동기화 오류:', err.message);
        }
      },
      { timezone: 'Asia/Seoul' },
    );

    console.log(`[members] 자동 크롤링 스케줄 등록: "${schedule}" (Asia/Seoul)`);
  },
};
