import { createSomoimAutomationService } from './somoim-automation.service.js';

// 자동 등록은 실제 제출이 목적이라, 제출 스위치가 꺼져 있으면 구독하지 않는다.
// 구독하지 않으면 모임 생성은 지금과 똑같이 동작한다(듣는 사람이 없으면 아무 일도 없다).
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

  ctx.hooks.on('meetupCreated', (meetup) => service.createJobForMeetup(meetup));
}
