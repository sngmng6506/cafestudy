# Somoim automation worker

별도 서버에서 돌면서 CafeStudy 서버의 자동화 job을 가져와 ADB로 안드로이드 태블릿의
소모임 앱을 조작한다. API 계약은 [SOMOIM_AUTOMATION.md](../SOMOIM_AUTOMATION.md)가
source of truth다.

이 디렉터리는 Railway 런타임 이미지에 포함되지 않는다(Dockerfile이 `src/`, `shared/`,
`client/dist/`, `migrations/`, `scripts/`만 복사한다). CafeStudy 배포와 무관하게 worker 서버에서만
실행한다.

## 현재 상태

배관(job 루프, 안전장치, 실패 분기)과 `handlers/create-meetup.js`(dryRun) 모두 동작한다.
자동화 계정은 "[홍대] it&ai 스터디" 클럽 운영진 전용이며(`create-meetup.js`의
`TARGET_GROUP_NAME`), 다른 클럽은 지원하지 않는다. 태블릿에 ADBKeyBoard IME
(`com.android.adbkeyboard/.AdbIME`)가 설치·활성화돼 있어야 한글 입력이 된다. `submit`
모드 코드도 구현돼 있지만 worker의 `ALLOW_SOMOIM_SUBMIT`과 서버의
`SOMOIM_AUTOMATION_ALLOW_SUBMIT` 이중 스위치가 꺼져 있는 한 실행되지 않고, 실기기로
검증한 적도 없다.

## 실행

Node 22가 필요하다. 외부 의존성은 없다.

```bash
CAFESTUDY_SERVER_URL=https://cafestudy-production.up.railway.app \
INTERNAL_API_KEY=<서버와 같은 값> \
node worker/index.js
```

| 환경변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `CAFESTUDY_SERVER_URL` | ✅ | — | 서버 주소 |
| `INTERNAL_API_KEY` | ✅ | — | 서버의 같은 이름 변수와 일치해야 한다 |
| `ALLOW_SOMOIM_SUBMIT` | | `false` | 실제 제출 허용. 서버의 `SOMOIM_AUTOMATION_ALLOW_SUBMIT`과 **둘 다** true여야 제출된다 |
| `POLL_INTERVAL_MS` | | `5000` | 큐가 비었을 때 대기 시간 |
| `ADB_PATH` | | `adb` | adb 실행 파일 경로 |
| `ADB_SERIAL` | | (자동) | 기기를 명시 지정. 비우면 연결된 기기가 정확히 한 대일 때만 진행한다 |
| `ARTIFACT_DIR` | | `./worker-artifacts` | 스크린샷·UI dump 저장 위치 |

`INTERNAL_API_KEY`는 헤더로만 쓰고 로그·에러 메시지에 남기지 않는다.

## 태블릿 준비

무선 디버깅을 권장한다. 케이블 접촉 불량으로 기기가 사라지면 job은 곧바로
`needs_manual_review`로 실패한다.

```bash
adb pair <태블릿IP>:<페어링포트>     # 태블릿의 페어링 팝업에 뜬 6자리 코드 입력
adb connect <태블릿IP>:<디버깅포트>   # 팝업이 아니라 무선 디버깅 메인 화면의 포트
adb devices -l                       # state가 device 여야 한다
```

- 공유기에서 태블릿 IP를 고정 할당(DHCP 예약)해둔다. IP가 바뀌면 연결이 끊긴다.
- 화면 잠금을 끄고 `adb shell settings put global stay_on_while_plugged_in 3`을 적용한다.
  잠금 화면은 계약상 무조건 `needsManualReview` 사유다.

## 구조

```text
index.js              # claim → runJob → complete/fail 루프, 종료 시그널 처리
config.js             # 환경변수 → worker 설정
api-client.js         # 서버 job endpoint 호출 (x-internal-key)
job-runner.js         # job 하나 실행. dryRun/submit 안전장치와 실패 분기
adb.js                # 기기 목록 파싱·선택, shell/screenshot/uiautomator 래퍼
errors.js             # ManualReviewError / TransientError
handlers/             # job type별 화면 자동화
```

서버 통신(`api-client`)과 job 실행(`job-runner`)을 분리해서, 기기 없이도 안전장치와
실패 분기를 단위 테스트로 검증한다.

## 실패 처리 원칙

확인할 수 없는 상태는 추측하지 않는다. handler가 던지는 에러는 다음과 같이 매핑된다.

- `ManualReviewError` → `needsManualReview: true`
- `TransientError` → `needsManualReview: false` (아무 입력도 하지 않은 상태의 명백한
  네트워크·앱 실행 timeout에만 쓴다)
- 그 밖의 모든 에러 → `needsManualReview: true` (애매하면 true)

기기를 확정할 수 없거나 dryRun/submit 조합이 잘못된 경우 handler는 아예 실행하지 않는다.

worker가 claim한 뒤 죽어서 결과를 보고하지 못하면 job은 `claimed`로 남는다. 서버가
다음 claim 요청 때 회수하므로(기본 900초, 3회) worker를 다시 켜면 알아서 재시도된다.
재시도를 다 쓴 job은 `needs_manual_review`로 넘어간다.

## 테스트

```bash
node --test test/worker.*.test.js
```
