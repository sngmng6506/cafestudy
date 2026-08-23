# 웹 모임 생성 시 소모임 정모 자동 등록

작성일: 2026-08-23

## 배경

소모임 앱에서 정모를 개설할 수 있는 사람은 운영진뿐이다. 그래서 일반 멤버는 모임을
열고 싶어도 운영진에게 부탁해야 했다.

이 설계의 목적은 **권한 없는 멤버도 CafeStudy 웹에서 모임을 만들면, 자동화 Bot 계정이
소모임 앱에 정모를 대신 개설해 주는 것**이다. 소모임 정모는 "이 날 모임이 있다"는
표시이자 자리 확보용이고, 실제 참가 신청은 웹에서만 받는다.

기존 구현은 관리자가 관리자 화면에서 수동으로 요청을 넣는 형태였다. 이 문서는 그
트리거를 **모임 생성**으로 바꾼다.

## 사용자 흐름

1. 멤버가 웹에서 모임을 만든다.
2. 모임이 "소모임 등록 중" 상태로 목록에 나타난다. 아직 참가할 수 없다.
3. worker가 job을 가져가 소모임 앱에서 정모를 개설한다. 정원은 웹 모임에서
   정한 값을 그대로 쓴다.
4. 성공하면 웹 모임이 정상 상태가 되고 참가 버튼이 열린다.
5. 실패하면 다른 멤버에게는 목록에서 사라진다. 개설자에게만 남아
   `다시 시도` / `취소`를 고를 수 있다.

## 아키텍처

### feature 간 결합

`AGENTS.md`는 feature 간 직접 import를 금지한다. feature는 폴더째 지워도 나머지가
동작해야 하는 플러그인이기 때문이다. 그래서 composition root가 만든 이벤트 훅으로
연결한다.

```text
meetups            --emit('meetupCreated')-------------> somoim-automation
somoim-automation  --emit('somoimRegistrationFailed')--> meetups
```

실패 통보도 훅으로 돌려보낸다. 그래야 `somoim-automation`이 `meetups` 테이블을 직접
수정하지 않는다. 두 feature 모두 상대를 모르고 이벤트 이름만 안다.

### 훅 구현

`src/core/hooks.js`에 `createHooks()`를 두고 `server.js`가 만들어 `ctx.hooks`로
주입한다.

- `on(event, listener)` — 리스너 등록. feature의 `onLoad(ctx)`에서 호출한다.
- `emit(event, payload)` — 등록된 리스너를 순서대로 await 하고 **반환값을 모아
  배열로 돌려준다.**
- 리스너가 던진 예외는 잡아서 로그만 남기고 다음 리스너로 넘어간다.
  자동화 문제로 모임 생성 자체가 실패하면 안 된다.

`emit`이 반환값을 모으는 이유는 **테이블 소유권** 때문이다. job을 만드는 것은
`somoim-automation`이지만 `meetups.somoim_state`를 쓰는 것은 `meetups`여야 한다.
리스너가 `{ jobId }`를 돌려주면 `meetups`가 그것을 받아 자기 행을 갱신한다.
자동화가 남의 테이블을 수정하지 않는다.

`emit`을 await 하는 이유는 job insert가 단일 INSERT라 빠르고, 응답을 보내기 전에
`somoim_state`가 확정되어야 사용자가 "등록 중"을 즉시 볼 수 있기 때문이다.

### 자동화가 꺼진 환경

`somoim-automation`은 `config.somoimAutomation.internalApiKey`가 없거나
`allowSubmit`이 false면 `meetupCreated` 리스너를 **등록하지 않는다.**

`meetups`는 이 조건을 알 필요가 없다. `emit` 결과가 비어 있으면 `somoim_state`를
`none`으로 두고 끝낸다. 즉 **듣는 사람이 없으면 자동 등록도 없다**는 규칙 하나로
로컬 개발과 CI가 지금처럼 동작한다.

`allowSubmit`은 기본값이 false다(`.env.example`). 따라서 이 기능은 **worker의 ADB
handler가 완성되고 서버·worker 양쪽 제출 스위치를 켜기 전까지 자동으로 꺼져 있다.**
그전까지 모임 생성은 지금과 완전히 동일하게 동작한다.

## 데이터 모델

```sql
ALTER TABLE meetups ADD COLUMN somoim_state text NOT NULL DEFAULT 'none'
  CHECK (somoim_state IN ('none', 'pending', 'registered', 'failed'));
ALTER TABLE meetups ADD COLUMN somoim_job_id uuid
  REFERENCES somoim_automation_jobs(id) ON DELETE SET NULL;
```

| 상태 | 의미 |
|---|---|
| `none` | 자동화 대상이 아님. 소모임에서 가져온 모임, 자동화가 꺼진 환경에서 만든 모임 |
| `pending` | job을 만들었고 등록을 기다리는 중. 참가 불가 |
| `registered` | worker가 성공을 보고함. 정상 모임 |
| `failed` | 등록 실패. 개설자에게만 보임 |

기존 `source_type`/`source_ref`와 혼동하지 않는다. 그 둘은 "소모임에서 가져온
모임"을 뜻하고, `somoim_state`는 "앱 모임이 소모임에 등록됐는가"를 뜻한다.

## job payload

| 필드 | 값 |
|---|---|
| `title` | 웹 모임 제목 |
| `scheduledAt` | 웹 모임 일시 |
| `location` | 웹 모임 장소 |
| `capacity` | 웹 모임 정원 그대로 |
| `description` | 웹 모임 설명 그대로 보내되 **앱에는 반영되지 않는다**(아래 참고) |
| `submit` | `true` — 자동 트리거이므로 실제 등록이 목적이다 |

소모임 앱의 "새 게시글 자동 생성" 모드에는 설명을 넣을 자리가 없다. 정모 안내문은
제목·일시·장소·비용으로 앱이 자동 생성한다. handler가 확인한 앱 제약이라 우회할 수
없다. payload에는 설명을 그대로 담아 두는데, 관리자 화면의 job 목록에서 무엇을
요청했는지 확인하는 기록으로 쓰기 위해서다. **소모임 정모에는 웹 모임의 설명이
나타나지 않는다.**

기존 제한값(`SOMOIM_AUTOMATION_LIMITS`)은 그대로 적용한다. 웹 모임 제목이 소모임
한도를 넘으면 job 생성이 실패하고 `failed`로 간다.

정원을 그대로 쓰므로 소모임 정모에는 빈자리가 남는다. 소모임 앱에서 직접 신청한
사람은 웹 참여자 명단에 잡히지 않아 두 쪽이 어긋날 수 있다. 웹으로 유도하는 별도
장치는 두지 않기로 했다 — 모임 문구는 개설자가 쓴 그대로 올라간다. 실제로
어긋나는 일이 생기면 그때 정원 조정이나 명단 대조를 검토한다.

## API 변경

- `POST /api/meetups` — 생성 후 `hooks.emit('meetupCreated', meetup)`. 응답에
  `somoimState`를 포함한다.
- `GET /api/meetups` — 응답에 `somoimState`를 포함한다. `failed`인 모임은
  **개설자에게만** 내려보낸다. 이 엔드포인트는 공개라 비로그인 방문자도 부르므로,
  로그인하지 않은 요청에는 `failed` 모임이 절대 포함되지 않는다.
- `POST /api/meetups/:id/join` — `somoim_state`가 `pending`이나 `failed`면 거부한다.
- `POST /api/meetups/:id/retry-somoim` (신규) — `requireUser`이며 **개설자 본인만**
  호출할 수 있다. `failed` 상태에서만 동작하고, 새 job을 만든 뒤 `pending`으로
  되돌린다. 취소는 기존 `DELETE /api/meetups/:id`를 그대로 쓴다.

worker endpoint(`/api/somoim-automation/*`)는 바뀌지 않는다. 지금 worker 서버에서 돌고
있는 worker와 `SOMOIM_AUTOMATION.md` 계약을 그대로 유지한다.

## 실패와 재시도

worker가 `POST /jobs/:id/fail`을 보고했을 때:

- `needsManualReview: false` (일시적 장애) — job의 `attempts`가
  `SOMOIM_AUTOMATION_MAX_ATTEMPTS`(기본 3)보다 작으면 job을 `pending`으로 되돌려
  다시 가져가게 한다. 웹 모임은 `pending`을 유지한다.
- `needsManualReview: true` 또는 `attempts`가 한도에 도달 —
  `somoimRegistrationFailed`를 emit 한다. `meetups`가 받아 해당 모임을 `failed`로
  바꾼다.

이미 있는 stale claim 회수(claim 후 응답 없음)와는 별개다. 그쪽은 worker가 죽은
경우를 다루고, 여기는 worker가 살아서 실패를 보고한 경우를 다룬다.

## 화면

**모임 카드** — `somoimState`에 따라 달라진다.

- `pending`: "소모임 등록 중" 배지, 참가 버튼 비활성
- `registered` / `none`: 지금과 동일
- `failed`: 개설자에게만 보이며 "소모임 등록에 실패했어요" 안내와
  `다시 시도` / `취소` 버튼

**관리자 자동화 탭** — 유지하되 성격이 바뀐다. 주 경로가 아니라 실패한 요청을
확인하고 수동으로 재시도하는 화면이다. 기존 요청 폼은 디버그용으로 남긴다.

## 테스트

- `hooks` 단위 테스트 — 리스너 등록·호출 순서, 리스너 예외가 emit을 중단시키지 않음
- 자동화가 꺼진 환경에서 모임 생성이 `somoim_state='none'`으로 끝나는지
- `pending` 모임에 참가가 거부되는지
- `failed` 모임이 개설자에게만 보이는지
- 실패 보고가 `needsManualReview` 여부에 따라 재시도 또는 `failed`로 갈리는지
- 마이그레이션 후 기존 모임이 `none`으로 남는지 (DB 통합 테스트)

## 범위 밖

- 개설자에게 보내는 푸시·알림. 지금 개인 알림 수단이 없어 화면에서만 알린다.
- `create_meetup` 외 job type(모임 수정, 참석자 확인).
- worker의 ADB handler 구현. 별도 세션에서 진행 중이며 이 설계와 독립적이다.
