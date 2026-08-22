import { ManualReviewError } from '../errors.js';

// TODO: 소모임 앱 모임 개설 화면 자동화.
//
// 아직 구현하지 않았다. 태블릿에서 `uiautomator dump`로 받은 화면 트리를 보고
// 입력창을 어떻게 특정할지(resource-id / text / 좌표) 정한 뒤 채운다.
//
// 구현 순서 (SOMOIM_AUTOMATION.md "Worker 처리 순서"):
//   1. 앱을 모임 개설 화면까지 이동
//   2. payload의 title/location/description/cost 입력, capacity 선택
//   3. scheduledAt을 날짜·시간 위젯에 반영하고 결과를 다시 읽어 검증
//   4. 채운 화면을 dumpUi로 다시 읽어 payload와 일치하는지 대조
//   5. mode === 'dryRun'이면 제출 직전에 멈추고
//      { stoppedAt: 'before_submit', screenshotKey } 반환
//   6. mode === 'submit'이면 4번 대조를 통과한 경우에만 제출
//
// 확인할 수 없는 화면 상태는 추측하지 말고 ManualReviewError를 던진다.
export function createCreateMeetupHandler({ adb, artifactDir } = {}) {
  return async function createMeetup({ payload, deviceId, mode }) {
    void adb;
    void artifactDir;
    void payload;
    void deviceId;
    void mode;

    throw new ManualReviewError('create_meetup handler is not implemented yet', {
      stage: 'handler_not_implemented',
    });
  };
}
