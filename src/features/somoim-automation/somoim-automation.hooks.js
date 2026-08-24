import { createSomoimAutomationService } from './somoim-automation.service.js';

// 스위치가 두 단계다.
//   allowSubmit  — job이 submit을 담을 수 있는가(실제 제출의 안전장치)
//   autoRegister — 모임을 만들 때 자동으로 job을 만드는가
// 제출을 먼저 켜서 관리자 화면의 수동 요청으로 실기기를 검증한 뒤, 자동 등록을
// 켜는 순서를 만들기 위해 나눴다. autoRegister만 켜는 조합은 의미가 없다 —
// job이 submit을 못 담아 모든 모임이 failed로 끝난다.
export function registerMeetupCreatedListener(ctx) {
  const config = ctx.config?.somoimAutomation ?? {};
  if (!config.internalApiKey || !config.allowSubmit) return;
  if (!ctx.hooks?.on) return;

  const service = createSomoimAutomationService({
    db: ctx.db,
    allowSubmit: config.allowSubmit,
    staleClaimSeconds: config.staleClaimSeconds,
    maxAttempts: config.maxAttempts,
  });

  if (config.autoRegister) {
    ctx.hooks.on('meetupCreated', (meetup) => service.createJobForMeetup(meetup));
  }

  // 재시도는 autoRegister와 무관하게 항상 구독한다. meetupCreated에 얹어 재사용하면
  // autoRegister를 나중에 끌 때(예: 자동 등록을 잠깐 멈추고 싶을 때) 이미 failed로
  // 쌓인 모임의 "다시 시도" 버튼까지 조용히 죽는다 — allowSubmit만 있어도 호스트가
  // 수동으로 재시도할 수 있어야 한다는 계약과 어긋난다.
  ctx.hooks.on('meetupSomoimRetryRequested', (meetup) => service.createJobForMeetup(meetup));

  // 취소는 autoRegister와 무관하게 구독한다. 자동 등록을 껐더라도 그전에 만들어진
  // pending job이 큐에 남아 있을 수 있고, 그건 여전히 멈출 수 있어야 한다.
  ctx.hooks.on('meetupCancelled', ({ jobId }) => {
    if (!jobId) return undefined;
    return service.cancelJobForMeetup(jobId);
  });
}
