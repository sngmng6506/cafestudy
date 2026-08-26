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
  // job과 이미 등록된 정모는 남아 있고, 그건 여전히 정리할 수 있어야 한다.
  //
  // 등록 단계에 따라 할 일이 다르다.
  //   pending    — 아직 앱에 아무것도 없다. 큐의 job만 멈추면 끝난다.
  //   registered — 앱에 정모가 이미 있다. 지우는 job을 새로 만든다.
  // 그 사이(claimed 상태로 worker가 실기기를 조작하는 중) 취소하면 job 취소가
  // 실패하고, 정모는 만들어진다. 그건 삭제 job으로 이어지지 않는다 — 취소 시점의
  // somoim_state가 아직 pending이기 때문이다. 관리자 큐에 등록 성공으로 남으므로
  // 손으로 지울 수 있다. 이 경합까지 자동으로 덮으려면 등록 완료 훅에서 취소 여부를
  // 되짚어야 하는데, 희귀한 경합 때문에 정상 경로에 왕복을 더할 이유가 없다고 봤다.
  ctx.hooks.on('meetupCancelled', (meetup) => {
    if (meetup?.somoimState === 'pending' && meetup.somoimJobId) {
      return service.cancelJobForMeetup(meetup.somoimJobId);
    }
    if (meetup?.somoimState === 'registered') {
      return service.deleteJobForMeetup(meetup);
    }
    return undefined;
  });
}
