import { createSomoimAutomationService } from './somoim-automation.service.js';

// 스위치가 두 단계다.
//   allowSubmit  — job이 submit을 담을 수 있는가(실제 제출의 안전장치)
//   autoRegister — 모임을 만들 때 자동으로 job을 만드는가
// 제출과 자동 등록을 따로 멈출 수 있도록 나눴다. autoRegister만 켜는 조합은 의미가 없다 —
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

  // 생성 완료와 웹 취소가 엇갈리면 소모임에만 정모가 남는다. 성공 처리 시
  // meetups feature가 취소 상태를 다시 확인해 이 이벤트를 보내므로 즉시 삭제한다.
  ctx.hooks.on('meetupRegisteredAfterCancellation', (meetup) => service.deleteJobForMeetup(meetup));

  // 취소는 autoRegister와 무관하게 구독한다. 자동 등록을 껐더라도 그전에 만들어진
  // job과 이미 등록된 정모는 남아 있고, 그건 여전히 정리할 수 있어야 한다.
  //
  // 등록 단계에 따라 할 일이 다르다.
  //   pending    — 아직 앱에 아무것도 없다. 큐의 job만 멈추면 끝난다.
  //   registered — 앱에 정모가 이미 있다. 지우는 job을 새로 만든다.
  // 그 사이(claimed 상태로 worker가 실기기를 조작하는 중) 취소하면 여기서는 job을
  // 강제로 바꾸지 않는다. worker preflight가 제출을 막고, 이미 생성까지 끝난 경합은
  // meetupRegisteredAfterCancellation 보상 이벤트가 삭제 job으로 수렴시킨다.
  ctx.hooks.on('meetupCancelled', async (meetup) => {
    if (meetup?.somoimState === 'registered') {
      return service.deleteJobForMeetup(meetup);
    }
    if (meetup?.somoimState !== 'pending' || !meetup.somoimJobId) return undefined;

    // 아직 큐에 있으면 멈추는 것으로 끝난다 — 앱에는 아직 아무것도 없다.
    if (await service.cancelJobForMeetup(meetup.somoimJobId)) return { cancelled: true };

    // 못 멈췄다 = worker가 이미 집어갔다. 그 job이 제출을 시도했다면 정모가
    // 만들어졌을 수 있다. 실패로 보고된 job도 마찬가지다 — 실기기에서 제출 직후
    // 화면을 읽다 adb가 깨져, job은 실패인데 정모는 앱에 남은 일이 있었다.
    // 그때 somoim_state는 pending에 머물러 이 훅이 아무것도 하지 않았고, 취소한
    // 모임의 정모가 앱에 그대로 남았다.
    //
    // 지우러 가는 쪽이 안전하다. 삭제 handler는 제목과 일시가 모두 맞을 때만
    // 지우고, 정모가 없으면 사람에게 넘긴다 — 엉뚱한 것을 지우지 않는다.
    if (await service.didAttemptSubmit(meetup.somoimJobId)) {
      return service.deleteJobForMeetup(meetup);
    }
    return undefined;
  });
}
