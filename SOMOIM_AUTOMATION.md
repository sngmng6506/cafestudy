# 소모임 자동화 API 계약

CafeStudy 서버는 자동화 job을 저장하고, worker 서버가 Android 기기에서 소모임 앱을 조작한다. 서버가 기기에 직접 접근하지 않는다.

worker 구현과 실행 방법은 [worker/README.md](./worker/README.md)에 있다.

## 안전 원칙

- 기본 동작은 `dryRun`이다.
- 실제 제출은 서버와 worker 양쪽에서 모두 허용한 경우에만 가능하다.
- `INTERNAL_API_KEY`, 세션 토큰, 개인정보가 담긴 화면은 로그에 남기지 않는다.
- 화면 상태나 입력 결과가 불확실하면 추측하지 말고 `needsManualReview: true`로 실패 처리한다.

## 인증

관리자 endpoint는 CafeStudy 세션 쿠키를 사용한다. 로그인 시 발급된 HttpOnly 쿠키를
그대로 보낸다.

```http
Cookie: cafestudy_session=<session-token>
```

`Authorization: Bearer <token>`은 `ALLOW_BEARER_AUTH=true`일 때만 동작하며, 이 값은
프로덕션에서 기본 비활성화다. 운영 환경에서 Bearer 헤더로 호출하면 401이다.

worker endpoint는 내부 키를 사용한다.

```http
x-internal-key: <INTERNAL_API_KEY>
```

## Job이 만들어지는 경로

웹에서 모임을 만들면 서버가 자동으로 job을 만든다. 운영진이 아닌 멤버도 모임을 열 수
있게 하는 것이 이 자동화의 목적이다. 관리자 화면의 요청 폼은 실패한 요청을 확인하고
수동으로 재시도하는 용도로 남는다.

스위치는 두 단계다. 제출을 먼저 열어 관리자 화면의 수동 요청으로 실기기를 검증한 뒤,
자동 등록을 여는 순서를 만들기 위해 나눴다.

| 스위치 | 뜻 |
|---|---|
| `SOMOIM_AUTOMATION_ALLOW_SUBMIT` | job이 `submit`을 담을 수 있는가. 실제 제출의 안전장치다 |
| `SOMOIM_AUTOMATION_AUTO_REGISTER` | 모임을 만들 때 자동으로 job을 만드는가 |

`INTERNAL_API_KEY`와 위 두 값이 모두 켜져야 자동 등록이 동작한다. `ALLOW_SUBMIT`만
켜면 수동 요청으로 제출을 시험할 수 있고 모임 생성은 기존과 똑같이 끝난다.
`AUTO_REGISTER`만 켜는 조합은 의미가 없어 서버가 구독하지 않는다 — job이 `submit`을
담지 못해 모든 모임이 `failed`로 끝나기 때문이다.

호스트의 "다시 시도"(`POST /api/meetups/:id/retry-somoim`)는 `AUTO_REGISTER`와
무관하게 `ALLOW_SUBMIT`만 있으면 항상 동작한다. 자동 등록을 잠시 끄더라도 그전에
`failed`로 남은 모임은 여전히 수동으로 재시도할 수 있어야 하기 때문이다.

## Job 생성

```http
POST /api/somoim-automation/meetups
Cookie: cafestudy_session=<session-token>
Content-Type: application/json
```

```json
{
  "title": "토요일 카페 스터디",
  "scheduledAt": "2026-07-25T14:00:00+09:00",
  "location": "강남역 스타벅스",
  "capacity": 8,
  "description": "각자 할 일 가져와서 2시간 집중",
  "cost": "각자 음료",
  "submit": false
}
```

서버는 job을 `pending`으로 저장한다. worker payload는 위와 같되 `scheduledAt`이
UTC ISO로 정규화되고 `dryRun`이 `submit`의 반대값으로 채워진다.

- 필수: `title`, `scheduledAt`, `location`. 선택: `capacity`, `description`, `cost`.
- 길이·범위 제한은 `shared/domain-constraints.js`의 `SOMOIM_AUTOMATION_LIMITS`가
  source of truth다. 여기에 옮겨 적지 않는다.
- 문자열은 앞뒤 공백을 제거하고 연속 공백을 정규화한다.
- `scheduledAt`은 미래여야 한다. 이미 지난 시각은 거부한다.
- `submit: true`는 서버에 `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`가 없으면 거부한다.

## Job 조회

관리자 전용이며 세션 쿠키를 사용한다.

```http
GET /api/somoim-automation/jobs?status=pending,claimed&limit=20&offset=0
GET /api/somoim-automation/jobs/:id
```

- `status`: 선택. 쉼표로 여러 개를 받는다(`pending`, `claimed`, `succeeded`, `failed`,
  `needs_manual_review`). 없으면 전체를 반환한다.
- `limit`: 1~50, 기본 20. `offset`: 0 이상, 기본 0.
- 최신순(`created_at DESC`)으로 반환하며 응답은 `{ items, hasMore, nextOffset }`다.
- 목록은 `payload`, `result`, `errorMessage`, `attempts`를 그대로 포함한다.
  dry-run 결과와 실패 사유를 여기서 확인한다.

## Worker endpoint

모두 `x-internal-key` 헤더가 필요하고, 본문이 있으면 JSON이다.

### Claim

```http
POST /api/somoim-automation/jobs/claim
```

가장 오래된 `pending` job 하나를 원자적으로 `claimed`로 바꾸고 반환한다. job이 없으면 `job: null`을 반환한다. claim 시 `attempts`가 1 증가한다.

claim 직전에 stale claim을 회수한다. `SOMOIM_AUTOMATION_STALE_CLAIM_SEC`(기본 900초)이
지나도록 결과 보고가 없는 `claimed` job은 `pending`으로 되돌리고, `attempts`가
`SOMOIM_AUTOMATION_MAX_ATTEMPTS`(기본 3)에 도달했으면 `needs_manual_review`로 넘긴다.
회수한 개수는 응답의 `recovered`로 함께 반환한다. 별도 스케줄러 없이 worker가 폴링할
때만 돈다.

### Complete

```http
POST /api/somoim-automation/jobs/:id/complete
```

```json
{
  "result": {
    "mode": "dryRun",
    "stoppedAt": "before_submit",
    "screenshotKey": "somoim-automation/<job-id>/before-submit.png",
    "deviceId": "<device-id>"
  }
}
```

`claimed` job만 완료할 수 있으며 `result`는 객체여야 한다. dry-run은 최종 제출 전에 멈춘 사실을 결과에 남긴다.

`screenshotKey`는 오브젝트 스토리지 키 모양(`somoim-automation/<job-id>/<이름>.png`)이며
아직 스토리지에 올라가지 않는다. 실제 파일이 있는 worker 로컬 경로는 같은 결과의
`screenshotPath`에 따로 담는다. 스토리지를 붙일 때 키는 그대로 두고 업로드만 더하면 된다.

### Submit attempt

```http
POST /api/somoim-automation/jobs/:id/submit-attempt
```

worker가 **되돌릴 수 없는 제출 버튼을 누르기 직전에** 부른다. 서버는 `claimed` job에
`submit_attempted_at`을 찍는다. 정모 생성은 취소할 수 없고 job에 멱등성 키가 없어,
표시 없이 보고가 끊기면 stale 회수가 job을 재실행해 정모를 하나 더 만든다.

- 이 호출이 실패하면 worker는 제출하지 않고 물러난다(아직 아무것도 만들지 않았으므로
  재시도해도 안전하다).
- 표시가 있는 job은 자동 재시도하지 않는다. stale 회수도, worker가
  `needsManualReview: false`로 보고한 실패도 모두 `needs_manual_review`로 간다.
- 연결된 모임은 `pending`에 남긴다. `failed`로 내리면 개설자의 "다시 시도"가 중복을
  만든다. 사람이 소모임 앱에서 실제 생성 여부를 확인하고 정리한다.
- `dryRun` job은 이 endpoint를 부르지 않으므로 기존대로 재시도된다.

### Fail

```http
POST /api/somoim-automation/jobs/:id/fail
```

```json
{
  "errorMessage": "Create button was not found",
  "needsManualReview": true,
  "result": {
    "stage": "open_create_screen",
    "screenshotKey": "somoim-automation/<job-id>/failure.png"
  }
}
```

`claimed` job만 실패 처리할 수 있다. `errorMessage`는 필수이며 최대 1000자다. `result`가 있으면 객체여야 한다.

## 상태 전이

```text
pending → claimed → succeeded
                  ↘ failed
                  ↘ needs_manual_review
```

- `pending`만 claim할 수 있다.
- claim한 job은 반드시 complete 또는 fail로 끝낸다.
- 보고 없이 stale 상태로 남은 `claimed` job은 다음 claim 때 회수한다
  (재시도 여유가 있으면 `pending`, 다 썼으면 `needs_manual_review`).
- 완료·실패가 **보고된** job은 다시 실행하지 않는다. worker가 결과를 보고했다면
  그 판단을 뒤집지 않는다.
- 아직 claim되지 않은 `pending` job은 서버가 중단할 수 있다. 개설자가 모임을
  취소하면 그 job을 `failed`로 바꾸고 `error_message`에
  `모임이 취소되어 등록을 중단했어요`를 남긴다. 이미 claim된 job은 건드리지
  않는다 — worker가 기기를 조작하는 중이라 상태를 바꾸면 complete/fail 보고와
  어긋난다. 그때는 정모가 생성되며 사람이 정리해야 한다.
- `submit_attempted_at`이 찍힌 job은 재시도 여유가 남아 있어도 `pending`으로
  돌아가지 않고 `needs_manual_review`로 간다(위 "Submit attempt" 참고).

## dryRun과 submit

허용되는 payload는 두 가지뿐이다.

| dryRun | submit | 동작 |
|---|---|---|
| `true` | `false` | 폼을 채우고 최종 제출 전에 멈춘다. |
| `false` | `true` | 모든 안전 조건을 통과한 경우 실제 제출한다. |

다른 조합은 `needsManualReview: true`로 실패 처리한다.

실제 제출은 아래 조건이 모두 참일 때만 가능하다.

1. payload가 `dryRun: false`, `submit: true`다.
2. 서버에 `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`가 설정되어 있다.
3. worker 로컬 설정에 `ALLOW_SOMOIM_SUBMIT=true`가 설정되어 있다.
4. 제출 직전 화면의 제목·일시·장소·정원 등 핵심 값이 payload와 일치한다.
5. 기기 타임존이 `Asia/Seoul`이다. 앱은 기기 벽시계로 정모 시각을 해석하므로,
   타임존이 다르면 화면 값은 맞는데 실제 정모 시각이 어긋난다. 4번 대조는 같은
   문자열끼리 비교하므로 이 어긋남을 잡지 못한다.
6. `submit-attempt` 기록에 성공했다.

조건 하나라도 확인할 수 없으면 제출하지 않는다.

제출한 뒤에는 **버튼을 눌렀다는 사실을 성공으로 삼지 않는다.** 정모 개설 폼이
화면에서 사라졌는지 확인하고, 폼이 그대로면 앱이 제출을 거부한 것이므로
`needsManualReview: true`로 실패 처리한다. 앱에 정모 목록을 프로그램적으로 대조할
화면이 없어, "폼을 떠났다"가 지금 확인할 수 있는 가장 강한 신호다.

## needsManualReview 기준

다음은 `true`로 처리한다.

- 기기가 없거나 여러 대이며 대상 기기를 확정할 수 없음
- unauthorized, offline, 잠금, 로그아웃 또는 보안 확인 화면
- 예상한 화면·버튼·입력창이 없음
- 날짜·시간·장소 선택 결과를 검증할 수 없음
- 제출 직전 화면이 payload와 다름
- 일부 외부 동작 이후 상태를 확정할 수 없음
- `dryRun`과 `submit` 조합이 잘못됨
- `scheduledAt`이 이미 지남 — 서버가 job 생성 시점에 걸러내지만(`scheduledAt must
  be in the future`), 큐 대기·stale-claim 재시도·호스트의 뒤늦은 재시도로 그 사이
  시간이 흘러 worker가 집어들 때는 이미 지났을 수 있다. worker는 이 경우 지난
  날짜로 화면을 채우려 들지 않고 바로 실패 처리한다
- 기기 타임존이 `Asia/Seoul`이 아니거나 읽을 수 없음
- 제출 버튼을 눌렀는데 정모 개설 폼이 화면에 그대로 남아 있음(앱이 제출을 거부)
- 제출을 시도한(`submit_attempted_at`) job의 결과 보고가 끊김 — 정모가 생성됐는지
  사람이 소모임 앱에서 확인해야 한다

아무 입력도 하지 않은 상태에서 발생한 명확한 일시적 네트워크·앱 실행 timeout은 `false`로 처리할 수 있다. 애매하면 `true`다.

## Worker 처리 순서

1. job을 claim한다.
2. Android 기기가 정확히 한 대이며 authorized 상태인지 확인한다.
3. job type에 맞는 handler를 실행한다.
4. 폼을 채운 뒤 화면 값이 payload와 일치하는지 검증한다.
5. dry-run이면 제출 전 멈추고 complete한다.
6. submit이면 모든 이중 안전장치를 확인하고, `submit-attempt`를 기록한 뒤에만 제출한다.
7. 제출 후 폼을 떠났는지 확인한다. 떠나지 못했으면 fail한다.
8. 불확실한 상태는 `needsManualReview: true`로 fail한다.

worker 프로세스는 **한 번에 하나만** 떠야 한다. job claim은 job 단위 원자성만
보장하므로, worker가 둘이면 서로 다른 job을 각각 claim해 같은 태블릿 한 대를 동시에
조작한다. worker는 시작할 때 락 파일을 잡고, 이미 살아 있는 worker가 있으면 즉시
종료한다([worker/README.md](./worker/README.md) 참고).
