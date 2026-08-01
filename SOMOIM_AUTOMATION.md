# Somoim Automation API Contract

CafeStudy can request creation of a Somoim meetup, but the real Somoim app automation runs outside Railway on the home MiniPC connected to an Android tablet. The server only stores jobs and exposes a polling contract for the worker.

The worker must treat every job as a real-world side effect unless `payload.dryRun` is true. The default server behavior is dry-run only.

## Actors

- **CafeStudy API**: stores automation jobs in `somoim_automation_jobs`.
- **MiniPC worker**: polls the API, controls the Android tablet, and reports success or failure.
- **Android tablet**: logged into the Somoim app. The API must not require direct network access to the tablet.

## Authentication

Admin-facing endpoints require the normal CafeStudy session token.

Worker endpoints require:

```http
x-internal-key: <INTERNAL_API_KEY>
```

The worker must not log `INTERNAL_API_KEY`, session tokens, or screenshots that contain private user data unless the log destination is explicitly private.

## Create Meetup Job

```http
POST /api/somoim-automation/meetups
Authorization: Bearer <admin-session-token>
Content-Type: application/json
```

Request:

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

Response:

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

Validation rules:

The numeric/string limits below are defined in `shared/domain-constraints.js` so the server and future worker can share the same contract.

- `title` is required, trimmed, whitespace-normalized, max 80 characters.
- `scheduledAt` is required and stored as ISO UTC.
- `location` is required, trimmed, whitespace-normalized, max 120 characters.
- `capacity` defaults to `8`, must be an integer from `1` to `100`.
- `description` is optional, whitespace-normalized, max 1000 characters.
- `cost` is optional, whitespace-normalized, max 80 characters.
- `submit: true` is rejected unless the server has `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`.

## Worker Payload

The worker receives the claimed job in this shape:

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

The worker should ignore unknown payload fields, but must fail the job if a required known field is absent or unusable.

## Claim

```http
POST /api/somoim-automation/jobs/claim
x-internal-key: <INTERNAL_API_KEY>
```

Response with a job:

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

Response when no job is available:

```json
{
  "data": {
    "job": null
  },
  "error": null
}
```

Claim semantics:

- The oldest `pending` job is claimed first.
- Claiming increments `attempts`.
- Only `pending` jobs are claimable.
- A claimed job must be finished by `complete` or `fail`.

## Complete

```http
POST /api/somoim-automation/jobs/11111111-1111-1111-1111-111111111111/complete
x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

Dry-run completion example:

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

Submit completion example:

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

Rules:

- Only `claimed` jobs can be completed.
- `result` must be an object.
- For `dryRun`, the worker must stop before tapping the final submit/register button.
- For `submit`, the worker may tap the final button only when `payload.submit === true` and `payload.dryRun === false`.

## Fail

```http
POST /api/somoim-automation/jobs/11111111-1111-1111-1111-111111111111/fail
x-internal-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

Example:

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

Rules:

- Only `claimed` jobs can be failed.
- `errorMessage` is required and stored up to 1000 characters.
- `result` must be an object when provided.

Use `needsManualReview: true` when human inspection is the safest next step. Use `needsManualReview: false` only for clearly transient failures that can be retried after a later worker run.

## dryRun and submit

`dryRun` is the default and must remain the default until the tablet automation has been proven stable.

Behavior matrix:

| payload | Worker behavior |
|---------|-----------------|
| `dryRun: true`, `submit: false` | Fill the Somoim form, stop before final submit, capture screenshot, complete the job. |
| `dryRun: false`, `submit: true` | Fill the form and submit only if the worker is explicitly configured to allow submit. |
| `dryRun: true`, `submit: true` | Treat as invalid worker input and fail with `needsManualReview: true`. |
| `dryRun: false`, `submit: false` | Treat as invalid worker input and fail with `needsManualReview: true`. |

The server currently only creates the first two shapes, and it blocks `submit: true` unless `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`.

The worker should also have its own local guard, for example:

```env
ALLOW_SOMOIM_SUBMIT=false
```

Final submit is allowed only when both are true:

- Server payload says `submit: true` and `dryRun: false`.
- Worker local config says `ALLOW_SOMOIM_SUBMIT=true`.

## needsManualReview Criteria

Set `needsManualReview: true` for:

- ADB device missing, unauthorized, offline, or wrong device selected.
- Tablet locked and the worker cannot unlock it safely.
- Somoim app is logged out or shows an account/security challenge.
- Expected screen, button, input, or text is missing.
- UI text changed enough that the worker may fill the wrong field.
- Date/time picker cannot be verified after selection.
- Location search returns ambiguous or no results.
- The form is filled but the final preview does not match the payload.
- Any unknown state after a partial side effect.
- Any job with contradictory `dryRun`/`submit` flags.

Set `needsManualReview: false` for:

- Temporary network timeout before any form interaction.
- Somoim app launch timeout before any form interaction.
- API reporting failure after the worker has not changed tablet state.

When in doubt, use `needsManualReview: true`.

## Worker Loop

Recommended worker loop:

```text
1. POST /jobs/claim
2. If job is null, sleep and retry.
3. Verify exactly one target Android device is connected and authorized.
4. Dispatch by job.type.
5. For create_meetup:
   - Open Somoim app.
   - Navigate to create meetup flow.
   - Fill title, scheduledAt, location, capacity, description, cost.
   - Verify visible form values.
   - If dryRun, stop before final submit and complete with screenshot metadata.
   - If submit, submit only when local ALLOW_SOMOIM_SUBMIT=true.
6. On expected unsafe state, fail with needsManualReview=true.
7. On transient pre-action failure, fail with needsManualReview=false.
```

The worker must be idempotent from the server perspective: after a job is reported as `succeeded`, `failed`, or `needs_manual_review`, it must not attempt that job again unless a future API explicitly requeues it.
