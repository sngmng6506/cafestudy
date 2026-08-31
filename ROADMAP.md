# Roadmap

앞으로 추가되면 좋은 기능 후보다. 관심 있는 사람이 이어서 구현해도 된다.

## 진행 중

### 앱 자동화 — 소모임 모임 만들기

웹에 없는 운영진 기능을 소모임 앱 자동화로 대신한다. 운영 방식은 **서버 + 안드로이드
실기기**로 정했다(에뮬레이터는 쓰지 않는다). 계약은
[SOMOIM_AUTOMATION.md](./SOMOIM_AUTOMATION.md), worker는
[worker/README.md](./worker/README.md)를 본다.

구현된 것:

- job 큐 API — 생성, 목록·단건 조회, claim/complete/fail, stale claim 회수
- worker 배관 — 폴링 루프, 기기 선택, dryRun/submit 이중 안전장치, 실패 분기
- ADB handler(`worker/handlers/create-meetup.js`) — `내모임` 탭 경로로 실기기
  end-to-end 검증을 마쳤다. 앱 동작 제약은 [worker/README.md](./worker/README.md)의
  "소모임 앱 자동화 노트"에 있다.
- 모임 생성 시 자동 등록 — 모임 카드에 등록 상태를 보여주고 실패 시 호스트가
  재시도할 수 있다. 상태 전이는 [DEVELOPMENT.md](./DEVELOPMENT.md)의 `meetups`,
  스위치 조합은 [SOMOIM_AUTOMATION.md](./SOMOIM_AUTOMATION.md)를 본다.
- 정모 삭제(`delete_meetup`) — 실기기로 생성·삭제를 끝까지 검증했다.
- 모임 취소 시 자동 삭제 — 등록된 모임을 웹에서 취소하면 앱의 정모도 지운다.
- 중복 제거 — 자동 등록된 모임이 크롤링으로 되돌아와 목록·통계·정산에 두 번
  들어가던 것을 `(제목, 일시)`로 짝지어 막았다(`shared/somoim-event-origin.js`).
- 되돌릴 수 없는 제출의 안전장치 — `submit-attempt` 기록, 제출 후 폼 이탈 확인,
  기기 타임존 검증, worker 중복 실행 방지 락.
- 장애 진단 — worker 로그를 공통 JSON 필드와 안정적인 오류 코드로 정규화했고,
  재시도가 끝난 최종 실패는 Discord webhook으로 알린다. webhook 장애는 자동화 결과와
  분리하며 같은 프로세스 안에서 같은 job·오류 알림을 중복 전송하지 않는다.

남은 것:

- job type 확장 — 모임 수정, 참석자 확인.
- 취소 후 다음 크롤링(하루 2회)까지 `somoim_events`에 정모가 남아, 최대 반나절
  이미 취소된 모임이 정모로 보인다. 수동 갱신으로 앞당길 수 있다.
