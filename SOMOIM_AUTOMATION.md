# 소모임 자동화 API 계약

CafeStudy는 소모임 모임 개설을 요청할 수 있지만, 실제 소모임 앱 자동화는 Railway가 아니라 집 미니PC에서 실행된다. 미니PC는 Android 태블릿에 연결되어 있고, 서버는 자동화 작업을 저장한 뒤 worker가 가져갈 수 있는 API 계약만 제공한다.

worker는 `payload.dryRun`이 true가 아닌 모든 작업을 실제 외부 서비스에 영향을 주는 작업으로 취급해야 한다. 서버의 기본 동작은 dry-run이다.

## 구성 요소

- **CafeStudy API**: 자동화 작업을 `somoim_automation_jobs`에 저장한다.
- **MiniPC worker**: API를 polling하고, Android 태블릿을 제어하며, 성공 또는 실패를 서버에 보고한다.
- **Android 태블릿**: 소모임 앱에 로그인된 기기다. API는 태블릿에 직접 네트워크 접근할 필요가 없어야 한다.

## 인증

관리자용 endpoint는 일반 CafeStudy 세션 토큰이 필요하다.

worker용 endpoint는 다음 헤더가 필요하다.

```http
x-internal-key: <INTERNAL_API_KEY>
```

worker는 `INTERNAL_API_KEY`, 세션 토큰, 개인정보가 포함된 스크린샷을 로그에 남기지 않는다. 단, 로그 저장소가 명시적으로 비공개로 보호되는 경우는 예외다.

## 모임 개설 Job 생성

```http
POST /api/somoim-automation/meetups
Authorization: Bearer <admin-session-token>
Content-Type: application/json
```

요청:

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

응답:

```json
{
  "data": {
    "jobId": "11111111-1111-1111-1111-111111111111",
    "status": "pending",
    "type": "create_meetup",
    "payload": {
      "title": "토요일 카페 스터디",
      "scheduledAt": "2026-07-25T05:00:00.000Z",
      "location": "강남역 스타벅스",
      "capacity": 8,
      "description": "각자 할 일 가져와서 2시간 집중",
      "cost": "각자 음료",
      "dryRun": true,
      "submit": false
    },
    "createdAt": "2026-07-17T00:00:00.000Z"
  },
  "error": null
}
```

검증 규칙:

아래 숫자/문자열 제한값은 `shared/domain-constraints.js`에 정의한다. 서버와 향후 worker가 같은 계약을 공유하기 위해서다.

- `title`은 필수다. 앞뒤 공백을 제거하고 연속 공백을 하나로 정규화하며, 최대 80자다.
- `scheduledAt`은 필수다. 서버는 ISO UTC 문자열로 저장한다.
- `location`은 필수다. 앞뒤 공백을 제거하고 연속 공백을 하나로 정규화하며, 최대 120자다.
- `capacity` 기본값은 `8`이다. `1`부터 `100`까지의 정수여야 한다.
- `description`은 선택값이다. 연속 공백을 하나로 정규화하며, 최대 1000자다.
- `cost`는 선택값이다. 연속 공백을 하나로 정규화하며, 최대 80자다.
- `submit: true`는 서버에 `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`가 설정되어 있지 않으면 거부된다.

## Worker Payload

worker는 claim된 job을 다음 형태로 받는다.

```json
{
  "data": {
    "job": {
      "id": "11111111-1111-1111-1111-111111111111",
      "requestedBy": "00000000-0000-0000-0000-000000000001",
      "type": "create_meetup",
      "payload": {
        "title": "토요일 카페 스터디",
        "scheduledAt": "2026-07-25T05:00:00.000Z",
        "location": "강남역 스타벅스",
        "capacity": 8,
        "description": "각자 할 일 가져와서 2시간 집중",
        "cost": "각자 음료",
        "dryRun": true,
        "submit": false
      },
      "status": "claimed",
      "attempts": 1,
      "claimedAt": "2026-07-17T00:01:00.000Z",
      "completedAt": null,
      "errorMessage": null,
      "result": null,
      "createdAt": "2026-07-17T00:00:00.000Z",
      "updatedAt": "2026-07-17T00:01:00.000Z"
    }
  },
  "error": null
}
```

worker는 알 수 없는 payload 필드를 무시해도 된다. 하지만 필요한 필드가 없거나 사용할 수 없는 값이면 job을 실패 처리해야 한다.

## Claim

```http
POST /api/somoim-automation/jobs/claim
x-internal-key: <INTERNAL_API_KEY>
```

job이 있을 때 응답:

```json
{
  "data": {
    "job": {
      "id": "11111111-1111-1111-1111-111111111111",
      "type": "create_meetup",
      "status": "claimed",
      "attempts": 1,
      "payload": {
        "title": "토요일 카페 스터디",
        "scheduledAt": "2026-07-25T05:00:00.000Z",
        "location": "강남역 스타벅스",
        "capacity": 8,
        "description": "각자 할 일 가져와서 2시간 집중",
        "cost": "각자 음료",
        "dryRun": true,
        "submit": false
      }
    }
  },
  "error": null
}
```

가져갈 job이 없을 때 응답:

```json
{
  "data": {
    "job": null
  },
  "error": null
}
```

claim 규칙:

- 가장 오래된 `pending` job을 먼저 claim한다.
- claim하면 `attempts`가 1 증가한다.
- `pending` 상태의 job만 claim할 수 있다.
- claim된 job은 반드시 `complete` 또는 `fail`로 끝내야 한다.

## Complete

```http
POST /api/somoim-automation/jobs/11111111-1111-1111-1111-111111111111/complete
x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

dry-run 완료 예시:

```json
{
  "result": {
    "mode": "dryRun",
    "stoppedAt": "before_submit",
    "screenshotKey": "somoim-automation/11111111-1111-1111-1111-111111111111/before-submit.png",
    "deviceId": "R9XXXXXXXXX"
  }
}
```

실제 등록 완료 예시:

```json
{
  "result": {
    "mode": "submit",
    "somoimUrl": "https://www.somoim.co.kr/...",
    "confirmationText": "등록되었습니다",
    "screenshotKey": "somoim-automation/11111111-1111-1111-1111-111111111111/success.png",
    "deviceId": "R9XXXXXXXXX"
  }
}
```

규칙:

- `claimed` 상태의 job만 완료 처리할 수 있다.
- `result`는 객체여야 한다.
- `dryRun`에서는 최종 등록/제출 버튼을 누르기 전에 멈춰야 한다.
- `submit`에서는 `payload.submit === true`이고 `payload.dryRun === false`일 때만 최종 버튼을 누를 수 있다.

## Fail

```http
POST /api/somoim-automation/jobs/11111111-1111-1111-1111-111111111111/fail
x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

예시:

```json
{
  "errorMessage": "Somoim create button was not found on the current screen",
  "needsManualReview": true,
  "result": {
    "stage": "open_create_screen",
    "screenshotKey": "somoim-automation/11111111-1111-1111-1111-111111111111/failure.png",
    "deviceId": "R9XXXXXXXXX"
  }
}
```

규칙:

- `claimed` 상태의 job만 실패 처리할 수 있다.
- `errorMessage`는 필수이며 최대 1000자까지 저장된다.
- `result`를 제공한다면 객체여야 한다.

사람이 화면을 직접 확인하는 것이 가장 안전한 경우 `needsManualReview: true`를 사용한다. 나중에 worker가 다시 시도해도 되는 명확한 일시적 실패일 때만 `needsManualReview: false`를 사용한다.

## dryRun과 submit

`dryRun`은 기본값이며, 태블릿 자동화가 안정적이라고 검증되기 전까지 기본값으로 유지한다.

동작 매트릭스:

| payload | worker 동작 |
|---------|-------------|
| `dryRun: true`, `submit: false` | 소모임 폼을 채우고, 최종 제출 전 멈춘 뒤 스크린샷을 남기고 완료 처리한다. |
| `dryRun: false`, `submit: true` | worker가 실제 제출을 허용하도록 설정된 경우에만 폼을 채우고 제출한다. |
| `dryRun: true`, `submit: true` | 잘못된 입력으로 보고 `needsManualReview: true`로 실패 처리한다. |
| `dryRun: false`, `submit: false` | 잘못된 입력으로 보고 `needsManualReview: true`로 실패 처리한다. |

현재 서버는 위 첫 두 형태만 만들며, `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`가 없으면 `submit: true`를 차단한다.

worker도 별도의 로컬 안전장치를 가져야 한다. 예:

```env
ALLOW_SOMOIM_SUBMIT=false
```

최종 제출은 아래 두 조건이 모두 true일 때만 허용된다.

- 서버 payload가 `submit: true`, `dryRun: false`다.
- worker 로컬 설정이 `ALLOW_SOMOIM_SUBMIT=true`다.

## needsManualReview 기준

다음 경우에는 `needsManualReview: true`로 설정한다.

- ADB 기기가 없거나, unauthorized/offline 상태거나, 잘못된 기기가 선택됐다.
- 태블릿이 잠겨 있고 worker가 안전하게 잠금 해제할 수 없다.
- 소모임 앱이 로그아웃 상태이거나 계정/보안 확인 화면을 표시한다.
- 예상한 화면, 버튼, 입력창, 텍스트가 없다.
- UI 문구가 바뀌어 worker가 잘못된 필드에 입력할 가능성이 있다.
- 날짜/시간 선택 후 선택값을 검증할 수 없다.
- 장소 검색 결과가 없거나 모호하다.
- 폼은 채웠지만 최종 확인 화면이 payload와 일치하지 않는다.
- 일부 외부 동작이 일어난 뒤 알 수 없는 상태가 됐다.
- `dryRun`/`submit` 플래그가 서로 모순된다.

다음 경우에는 `needsManualReview: false`를 사용할 수 있다.

- 폼에 아무 것도 입력하기 전 일시적 네트워크 timeout이 발생했다.
- 폼에 아무 것도 입력하기 전 소모임 앱 실행 timeout이 발생했다.
- 태블릿 상태를 바꾸지 않은 상태에서 API 보고만 실패했다.

판단이 애매하면 `needsManualReview: true`를 사용한다.

## Worker Loop

권장 worker loop:

```text
1. POST /jobs/claim
2. job이 null이면 잠시 대기 후 다시 시도한다.
3. 대상 Android 기기가 정확히 1대 연결되어 있고 authorized 상태인지 확인한다.
4. job.type에 따라 handler를 분기한다.
5. create_meetup 처리:
   - 소모임 앱을 연다.
   - 모임 개설 flow로 이동한다.
   - title, scheduledAt, location, capacity, description, cost를 입력한다.
   - 화면에 보이는 폼 값이 payload와 일치하는지 검증한다.
   - dryRun이면 최종 제출 전 멈추고 스크린샷 metadata와 함께 완료 처리한다.
   - submit이면 로컬 ALLOW_SOMOIM_SUBMIT=true일 때만 제출한다.
6. 안전하지 않은 예상 상태면 needsManualReview=true로 실패 처리한다.
7. 외부 동작 전의 일시적 실패면 needsManualReview=false로 실패 처리한다.
```

worker는 서버 관점에서 멱등적으로 동작해야 한다. job이 `succeeded`, `failed`, `needs_manual_review` 중 하나로 보고된 뒤에는, 향후 별도 requeue API가 생기기 전까지 같은 job을 다시 시도하지 않는다.
