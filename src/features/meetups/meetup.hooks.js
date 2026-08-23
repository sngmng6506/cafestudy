import { createMeetupQueries } from './meetup.queries.js';

// 소모임 등록이 최종 실패하면 그 모임을 failed로 바꾼다.
// 자동화가 meetups 테이블을 직접 수정하지 않도록 이 feature가 자기 행만 갱신한다.
export function registerSomoimFailureListener(ctx) {
  if (!ctx.hooks?.on) return;
  const queries = createMeetupQueries(ctx.db);

  ctx.hooks.on('somoimRegistrationFailed', async ({ jobId }) => {
    if (!jobId) return;
    await queries.markSomoimFailedByJob(jobId);
  });
}
