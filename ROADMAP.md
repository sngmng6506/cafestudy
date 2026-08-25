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
- 관리자 화면 — 모임 만들기 요청 폼과 진행 상태 목록
- ADB handler(`worker/handlers/create-meetup.js`) — `내모임` 탭 경로로 실기기
  end-to-end 검증을 마쳤다. 앱 동작 제약은 [worker/README.md](./worker/README.md)의
  "소모임 앱 자동화 노트"에 있다.
- 모임 생성 시 자동 등록 — 모임 카드에 등록 상태를 보여주고 실패 시 호스트가
  재시도할 수 있다. 상태 전이는 [DEVELOPMENT.md](./DEVELOPMENT.md)의 `meetups`,
  스위치 조합은 [SOMOIM_AUTOMATION.md](./SOMOIM_AUTOMATION.md)를 본다.
- 되돌릴 수 없는 제출의 안전장치 — `submit-attempt` 기록, 제출 후 폼 이탈 확인,
  기기 타임존 검증, worker 중복 실행 방지 락.

남은 것:

- 제출 경로 실기기 검증 — 위 안전장치들은 단위 테스트로만 확인했다. `submit`
  모드로 태블릿에서 끝까지 돌려본 적이 아직 없다.
- 관리자 화면 제출 토글 — 서버의 `allowSubmit` 여부를 클라이언트가 알 수 있어야
  한다. 지금은 환경변수로만 켜고 끈다.
- job type 확장 — 모임 수정, 참석자 확인. 현재 DB CHECK가 `create_meetup`만 허용한다.
- 스크린샷을 볼 수 없는 자동 등록 job — 자동 등록은 아무도 지켜보지 않고
  실행되는데 스크린샷이 서버에 없어(아래 항목 참고) 로그만으로 진단해야 한다.

## 구현 후보

### 자동화 결과 스크린샷 보기

worker가 남기는 스크린샷을 관리자 화면에서 볼 수 있게 한다. `result.screenshotKey`는
이미 스토리지 키 모양(`somoim-automation/<job-id>/<이름>.png`)이고 실제 파일은 worker
로컬의 `result.screenshotPath`에 있다. 업로드와 정리(GC) 정책만 정하면 키는 그대로
쓸 수 있다.
