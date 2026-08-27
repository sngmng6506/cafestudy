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

// 소모임 등록이 성공하면 그 모임을 registered로 바꾼다.
// markSomoimRegisteredByJob의 AND somoim_state='pending' 조건 덕에, 이미 재시도로
// 새 job에 넘어간 뒤 뒤늦게 도착한 완료 보고는 이 행을 건드리지 않는다.
export function registerSomoimSuccessListener(ctx) {
  if (!ctx.hooks?.on) return;
  const queries = createMeetupQueries(ctx.db);

  ctx.hooks.on('somoimRegistrationSucceeded', async ({ jobId }) => {
    if (!jobId) return;
    const meetup = await queries.markSomoimRegisteredByJob(jobId);
    if (meetup?.status === 'closed') {
      await ctx.hooks.emit('meetupRegisteredAfterCancellation', meetup);
    }
  });
}
