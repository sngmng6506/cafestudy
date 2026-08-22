# Roadmap

아래 항목은 앞으로 추가되면 좋은 기능 후보입니다. 관심 있는 사람이 이어서 구현해도 됩니다.

## 진행 중

### 앱 자동화 — 소모임 모임 만들기

웹에 없는 운영진 기능을 소모임 앱 자동화로 대신한다. 운영 방식은 **집 미니PC + 안드로이드
실기기**로 정했다(에뮬레이터는 쓰지 않는다). 계약은
[SOMOIM_AUTOMATION.md](./SOMOIM_AUTOMATION.md), worker는
[worker/README.md](./worker/README.md)를 본다.

구현된 것:

- job 큐 API — 생성, 목록·단건 조회, claim/complete/fail, stale claim 회수
- worker 배관 — 폴링 루프, 기기 선택, dryRun/submit 이중 안전장치, 실패 분기
- 관리자 화면 — 모임 만들기 요청 폼과 진행 상태 목록

남은 것:

- **ADB handler** — 소모임 앱 모임 개설 화면 자동화(`worker/handlers/create-meetup.js`).
  화면 트리를 확인해 입력창을 어떻게 특정할지(resource-id / text / 좌표) 정해야 한다.
  날짜·시간 위젯 조작과 결과 검증이 가장 까다로운 부분이다.
- **실제 제출 개방** — 지금은 dry-run만 만든다. 서버와 worker 스위치를 모두 켜고,
  제출 직전 화면 대조까지 확인한 뒤에 연다. 관리자 화면에도 제출 토글이 필요하다
  (서버의 `allowSubmit` 여부를 클라이언트가 알 수 있어야 한다).
- **job type 확장** — 모임 수정, 참석자 확인. 현재 DB CHECK가 `create_meetup`만 허용한다.

## 구현 후보

### 자동화 결과 스크린샷 보기

worker가 남기는 스크린샷을 관리자 화면에서 볼 수 있게 한다. 지금은 `result.screenshotKey`에
경로 문자열만 담기고 서버가 오브젝트 스토리지와 연결하지 않는다. 업로드 경로와 정리(GC)
정책을 정해야 한다.
