# 소모임 자동화 API 계약

CafeStudy 서버는 자동화 job을 저장하고, 집 미니PC worker가 Android 기기에서 소모임 앱을 조작한다. 서버가 기기에 직접 접근하지 않는다.

## 안전 원칙

- 기본 동작은 `dryRun`이다.
- 실제 제출은 서버와 worker 양쪽에서 모두 허용한 경우에만 가능하다.
- `INTERNAL_API_KEY`, 세션 토큰, 개인정보가 담긴 화면은 로그에 남기지 않는다.
- 화면 상태나 입력 결과가 불확실하면 추측하지 말고 `needsManualReview: true`로 실패 처리한다.

## 인증

관리자 endpoint는 CafeStudy 세션 토큰을 사용한다.

```http
Authorization: Bearer <admin-session-token>
```

worker endpoint는 내부 키를 사용한다.

```http
x-internal-key: <INTERNAL_API_KEY>
```

## Job 생성

```http
POST /api/somoim-automation/meetups
Authorization: Bearer <admin-session-token>
Content-Type: application/json
```

요청 payload:

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

서버는 job을 `pending`으로 저장하며 worker payload에 다음 값을 포함한다.

```json
{
  "title": "토요일 카페 스터디",
  "scheduledAt": "2026-07-25T05:00:00.000Z",
  "location": "강남역 스타벅스",
  "capacity": 8,
  "description": "각자 할 일 가져와서 2시간 집중",
  "cost": "각자 음료",
  "dryRun": true,
  "submit": false
}
```

검증 제한값은 `shared/domain-constraints.js`가 source of truth다.

- `title`: 필수, 최대 80자
- `scheduledAt`: 필수, 유효한 날짜·시간
- `location`: 필수, 최대 120자
- `capacity`: 정수 1~100, 기본 8
- `description`: 선택, 최대 1000자
- `cost`: 선택, 최대 80자
- 문자열은 앞뒤 공백을 제거하고 연속 공백을 정규화한다.
- `submit: true`는 서버에 `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`가 없으면 거부한다.

## Worker endpoint

### Claim

```http
POST /api/somoim-automation/jobs/claim
x-internal-key: <INTERNAL_API_KEY>
```

가장 오래된 `pending` job 하나를 원자적으로 `claimed`로 바꾸고 반환한다. job이 없으면 `job: null`을 반환한다. claim 시 `attempts`가 1 증가한다.

### Complete

```http
POST /api/somoim-automation/jobs/:id/complete
x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
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

### Fail

```http
POST /api/somoim-automation/jobs/:id/fail
x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
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
- 완료·실패가 보고된 job은 별도 requeue 기능이 생기기 전까지 다시 실행하지 않는다.

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

조건 하나라도 확인할 수 없으면 제출하지 않는다.

## needsManualReview 기준

다음은 `true`로 처리한다.

- 기기가 없거나 여러 대이며 대상 기기를 확정할 수 없음
- unauthorized, offline, 잠금, 로그아웃 또는 보안 확인 화면
- 예상한 화면·버튼·입력창이 없음
- 날짜·시간·장소 선택 결과를 검증할 수 없음
- 제출 직전 화면이 payload와 다름
- 일부 외부 동작 이후 상태를 확정할 수 없음
- `dryRun`과 `submit` 조합이 잘못됨

아무 입력도 하지 않은 상태에서 발생한 명확한 일시적 네트워크·앱 실행 timeout은 `false`로 처리할 수 있다. 애매하면 `true`다.

## Worker 처리 순서

1. job을 claim한다.
2. Android 기기가 정확히 한 대이며 authorized 상태인지 확인한다.
3. job type에 맞는 handler를 실행한다.
4. 폼을 채운 뒤 화면 값이 payload와 일치하는지 검증한다.
5. dry-run이면 제출 전 멈추고 complete한다.
6. submit이면 모든 이중 안전장치를 확인한 뒤에만 제출한다.
7. 불확실한 상태는 `needsManualReview: true`로 fail한다.
