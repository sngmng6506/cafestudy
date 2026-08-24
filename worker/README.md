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
| `ADB_CONNECT_ADDRESS` | | — | 기기가 사라졌을 때 다시 붙을 주소(`IP:포트`). 비워도 mDNS로 찾는다 |
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
- 충전기를 꽂아둔 채로 둔다. 빼면 화면 유지가 풀리고, 절전 중 Wi-Fi가 끊기면
  안드로이드가 무선 디버깅을 자동으로 꺼버린다. 다시 켜려면 태블릿 화면이 필요하다.

### 한글 입력 (ADBKeyBoard)

`adb shell input text`는 한글을 넣지 못한다. 정모 제목·장소를 채우려면
[ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard)를 설치하고 **활성 IME로
지정해두어야** 한다. 핸들러가 실행 직전에 `ime set`을 다시 호출하지만, 설치와
활성화가 안 돼 있으면 거기서 실패한다.

```bash
adb shell ime enable com.android.adbkeyboard/.AdbIME
adb shell ime set com.android.adbkeyboard/.AdbIME
adb shell settings get secure default_input_method   # 위 값이 나와야 한다
```

되돌리면 자동화가 다시 막히므로 이 기기에서는 계속 활성 IME로 둔다.

### 계정 초기 설정

bot 계정으로 소모임 앱에 처음 로그인하면 활동지역 설정 같은 첫 실행 화면이
뜬다. 이 화면들은 자동화 대상이 아니므로 **사람이 한 번 통과시켜 둬야 한다.**
`내모임` 탭에 가입한 모임이 바로 보이는 상태가 되면 준비가 끝난 것이다.

### 고정 포트로 바꾸기

무선 디버깅은 켤 때마다 포트가 바뀌고 Wi-Fi가 끊기면 꺼진다. 한 번 붙은 뒤
아래를 실행해두면 포트가 `5555`로 고정되고 Wi-Fi가 끊겼다 붙어도 유지된다
(재부팅하면 풀린다). 케이블 없이 기존 무선 연결로도 실행할 수 있다.

```bash
adb tcpip 5555                    # adbd가 재시작되며 현재 연결이 한 번 끊긴다
adb connect <태블릿IP>:5555
```

이 주소를 `ADB_CONNECT_ADDRESS`에 넣어두면 worker가 알아서 다시 붙는다.

**재부팅하면 `adb tcpip 5555`와 무선 디버깅이 둘 다 풀린다.** 열려 있는 adb 포트가
하나도 남지 않으므로 태블릿 화면에서 손으로 다시 켜는 것 외에 복구 방법이 없다.
한 번 붙었을 때 아래를 걸어두면 다음 재부팅부터는 손대지 않아도 된다(롬에 따라
두 번째 줄은 권한이 막혀 무시된다).

```bash
adb shell settings put global adb_wifi_enabled 1
adb shell setprop persist.adb.tcp.port 5555
```

### 자동 재연결

worker는 기기를 찾지 못하면 `ADB_CONNECT_ADDRESS`와 mDNS로 발견한 주소를
차례로 시도한 뒤 한 번 더 확인한다. 태블릿이 절전에서 깬 뒤 사람이 `adb
connect`를 해주지 않아도 대개 여기서 복구된다. 그래도 실패하면 job은 계약대로
`needsManualReview`로 넘어간다.

mDNS 탐색은 adb가 지원할 때만 동작한다. 데비안의 `adb 34.0.4-debian`처럼
mDNS가 빠진 빌드에서는 공식 platform-tools를 쓰거나 `ADB_CONNECT_ADDRESS`를
지정한다.

## 소모임 앱 자동화 노트

실기기에서 확인한 앱 동작이다. 코드만 봐서는 알 수 없어서 남긴다.

**검색으로 클럽을 찾지 않는다.** 이 앱은 검색을 프로그램적으로 제출할 방법이
없다. 검색어는 입력창에 들어가지만 `search_btn_layout` 탭, `input keyevent 66`,
ADBKeyBoard의 `ADB_EDITOR_CODE`(IME_ACTION_SEARCH) 셋 다 화면을 바꾸지 못했다.
대신 `내모임` 탭에서 가입한 모임을 직접 연다. bot 계정은 대상 클럽 하나에만
가입해 있고 다른 클럽은 다루지 않으므로 이걸로 충분하다.

**가입 모임과 추천 카드는 id가 다르다.** 가입 모임은 `name_text`,
추천·주변 모임 카드는 `groupname_text`다. `내모임` 화면에는 둘이 함께 나오므로
`name_text`만 봐야 남의 모임을 열지 않는다.

**uiautomator가 같은 창을 두 벌 덤프할 때가 있다.** bounds가 완전히 같은 노드가
중복으로 나온다. 개수를 세기 전에 bounds로 접어야 모임 하나가 둘로 세어지지 않는다
(`uniqueByBounds`).

## 구조

```text
index.js              # claim → runJob → complete/fail 루프, 종료 시그널 처리
config.js             # 환경변수 → worker 설정
api-client.js         # 서버 job endpoint 호출 (x-internal-key)
job-runner.js         # job 하나 실행. dryRun/submit 안전장치와 실패 분기
adb.js                # 기기 목록 파싱·선택, 자동 재연결, shell/screenshot/uiautomator 래퍼
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

실패한 job이 마지막으로 본 화면은 `worker-artifacts/ui-dump.xml`에 남는다. 어느
화면에서 막혔는지는 이 파일이 가장 확실한 증거다.

## 테스트

```bash
node --test test/worker.*.test.js
```
