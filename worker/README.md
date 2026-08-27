# Somoim automation worker

별도 서버에서 돌면서 CafeStudy 서버의 자동화 job을 가져와 ADB로 안드로이드 태블릿의
소모임 앱을 조작한다. API 계약은 [SOMOIM_AUTOMATION.md](../SOMOIM_AUTOMATION.md)가
source of truth다. 태블릿 준비 절차는 [TABLET_SETUP.md](./TABLET_SETUP.md)에 있다.

이 디렉터리는 Railway 런타임 이미지에 포함되지 않는다(Dockerfile이 `src/`, `shared/`,
`client/dist/`, `migrations/`, `scripts/`만 복사한다). CafeStudy 배포와 무관하게
worker 서버에서만 실행한다.

## 현재 상태

`create_meetup`(생성)과 `delete_meetup`(삭제) 모두 구현돼 있고, 실기기에서 정모를
만들고 지우는 것까지 end-to-end 검증했다.

## 실행

Node 22가 필요하다. 외부 의존성은 없다.

```bash
cp worker/.env.example worker/.env   # 값을 채운다. gitignore되므로 커밋되지 않는다
node --env-file=worker/.env worker/index.js
```

worker는 태블릿과 같은 네트워크에 있는 기계에서 돈다. 서버(Railway) 환경변수는
worker에 전달되지 않으니 설정은 그 기계의 `worker/.env`에 둔다. 상시 운영은
[TABLET_SETUP.md](./TABLET_SETUP.md)의 systemd 등록 절차를 따른다.

| 환경변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `CAFESTUDY_SERVER_URL` | ✅ | — | 서버 주소 |
| `INTERNAL_API_KEY` | ✅ | — | 서버의 같은 이름 변수와 일치해야 한다 |
| `ALLOW_SOMOIM_SUBMIT` | | `false` | 실제 제출 허용. 서버의 `SOMOIM_AUTOMATION_ALLOW_SUBMIT`과 **둘 다** true여야 제출된다 |
| `POLL_INTERVAL_MS` | | `5000` | 큐가 비었을 때 대기 시간 |
| `ADB_PATH` | | `adb` | adb 실행 파일 경로 |
| `ADB_SERIAL` | | (자동) | 기기를 명시 지정. 비우면 연결된 기기가 정확히 한 대일 때만 진행한다 |
| `ADB_CONNECT_ADDRESS` | | — | 기기가 사라졌을 때 다시 붙을 주소(`IP:포트`). 비워도 mDNS로 찾는다 |
| `ARTIFACT_DIR` | | `./worker-artifacts` | 스크린샷·UI dump 저장 위치. job id별 하위 폴더에 남는다 |
| `SOMOIM_TARGET_GROUP_NAME` | | `[홍대] it&ai 스터디` | 정모를 만들 클럽 이름. 클럽장이 이름을 바꾸면 여기서 맞춘다 |
| `MEETUP_PHOTO_PATH` | | (자동 생성) | 정모 사진으로 쓸 로컬 이미지. 비우면 단색 16:9 플레이스홀더를 만든다 |
| `SOMOIM_NOTIFY_MEMBERS` | | `false` | 정모 생성 시 전체 멤버 알림. 되돌릴 수 없어 켤 때만 `true`로 명시한다 |
| `WORKER_LOCK_FILE` | | (OS 임시폴더) | worker 중복 실행을 막는 락 파일 경로 |
| `DISCORD_AUTOMATION_WEBHOOK_URL` | | — | 최종 실패 알림을 보낼 Discord webhook. 비우면 비활성 |
| `DISCORD_ALERT_TIMEOUT_MS` | | `5000` | Discord 호출 제한 시간. 알림 실패는 job 결과에 영향을 주지 않는다 |

`INTERNAL_API_KEY`는 헤더로만 쓰고 로그·에러 메시지에 남기지 않는다.

## 태블릿 전제

코드가 이 상태를 전제하고, 어긋나면 job을 실패시킨다. 설정 방법은
[TABLET_SETUP.md](./TABLET_SETUP.md)에 있다.

- 타임존이 `Asia/Seoul`이다(handler가 시작할 때 확인한다).
- ADBKeyBoard가 설치돼 있고 활성 IME다. 한글 입력이 여기 의존한다.
- 계정의 첫 실행 화면은 사람이 통과시켜 둔 상태다.
- 화면 잠금이 꺼져 있다. 잠금 화면은 계약상 `needsManualReview` 사유다.

## 소모임 앱 자동화 노트

실기기에서 확인한 앱 동작이다. 코드만 봐서는 알 수 없어서 남긴다.

**검색으로 클럽을 찾지 않는다.** 이 앱은 검색을 프로그램적으로 제출할 방법이
없다. 검색어는 입력창에 들어가지만 `search_btn_layout` 탭, `input keyevent 66`,
ADBKeyBoard의 `ADB_EDITOR_CODE`(IME_ACTION_SEARCH) 셋 다 화면을 바꾸지 못했다.
대신 `내모임` 탭에서 가입한 모임을 직접 연다.

**`name_text`는 화면마다 뜻이 다르다.** `내모임` 화면에서는 가입한 모임 이름이지만,
홈 화면에서는 정모 이름이다(추천·주변 모임 카드는 `groupname_text`). 세기 전에
`가입한 모임` 헤더로 화면을 먼저 확인해야 남의 정모를 가입 모임으로 착각하지 않는다.

**`내 지역` 확인 화면이 비결정적으로 끼어든다.** 콜드 스타트 직후와 `내모임` 탭
진입 시 둘 다 나타날 수 있어 `dismissRegionGateIfPresent`를 양쪽 폴링 루프에서
부른다. 이미 설정된 값을 그대로 저장해 넘어가며 값을 바꾸지 않는다.

**클럽을 열면 마지막에 보던 하위 탭으로 들어간다.** 게시판이나 특정 게시글일 수
있어 `정모 만들기`가 없다. `openCreateMeetupForm`이 먼저 `홈` 탭을 누른다.

**클럽 홈에도 `정모 만들기` 버튼이 있다.** 개설 폼의 저장 버튼과 문구가 같으므로
`save_button` resource-id로 구분한다. 섞으면 성공한 제출을 실패로 보고한다.

**정모 사진 없이는 제출되지 않는다.** 폼을 다 채우고 `정모 만들기`를 눌러도 정모가
만들어지지 않고 사진 선택기가 뜬다. 그래서 submit에서는 `attachMeetupPhoto`가 먼저
사진을 붙인다 — 이미지를 기기로 push하고, 폼의 사진 영역을 눌러 선택기를 열고,
가장 최근 사진(방금 push한 것)을 고르고, 앱 내부 크롭 화면을 통과한다. 쓸 이미지는
`MEETUP_PHOTO_PATH`로 지정하고, 비우면 단색 16:9 플레이스홀더를 만들어 쓴다.

**키보드 창이 그 아래 버튼의 탭을 삼킨다.** IME 창은 uiautomator 덤프에 잡히지
않으면서 화면을 덮는다. 시간 선택기의 `OK`가 눌리지 않고, 폼에서도 첫 칸만 채워지고
나머지가 비는 원인이었다(가로 모드에서 두드러진다). 그래서 다이얼로그 버튼이나 다음
입력칸을 누르기 전에 `hideKeyboardIfShown`으로 내린다 — 떠 있을 때만 BACK을 보낸다.

**입력칸 사이 이동은 탭이 아니라 TAB 키로 한다.** 시간 선택기의 분 칸은 탭해도
포커스가 시 칸에 남는 기기가 있다. 그러면 분 값이 시 값을 덮어써 `00:00`이 된다.

**AM/PM 스피너는 값이 다를 때만 연다.** 열어 둔 드롭다운이 다이얼로그를 덮어,
뒤따르는 `OK` 탭이 드롭다운을 닫는 데 쓰인다.

**정모 삭제는 카드의 `취소`가 아니다.** 정기모임 카드의 `취소`(join_text)를 누르면
"정모 참석을 취소하시겠습니까?"가 뜬다 — 참석만 취소되고 정모는 남는다. 삭제는
카드 우상단 편집(edit_text_layout) → 정모 수정 → `정모 삭제하기` → `삭제`다.
게시글 쪽 `게시글 삭제`도 막혀 있다("정모와 연결된 게시글은 직접 삭제할 수 없습니다").

**정모를 만들면 내모임 화면에 "참여중인 정모 채팅" 섹션이 생긴다.** 거기에도 같은
클럽 이름이 `name_text`로 나와서, 위치를 안 따지고 고르면 클럽 대신 정모 채팅방이
열린다. `가입한 모임` 헤더 아래의 것만 고른다(`joinedGroupsBelow`).

**폼이 한 화면에 다 들어오지 않는다.** 가로 화면에서는 정모 공지 체크박스와 저장
버튼이 아래로 밀려 첫 덤프에 없다. 요소를 찾을 때와 폼 값을 대조할 때 모두 스크롤하며
읽는다(`scrollUntilFound`, `collectFormValues`). 화면 밖이라는 이유로 "값이 비었다"고
판정하면 안 된다.

**전체 멤버 알림은 `check_box`의 `selected`로 읽고 끈다.** 앱 기본값은 켜짐이라
정모를 만들면 클럽 전원에게 알림이 간다. worker는 이걸 기본으로 꺼서 만든다 —
자동 등록은 아무도 지켜보지 않는 시각에 돌고 재시도마다 알림이 반복되는데,
나간 알림은 되돌릴 수 없다. 실제로 알릴 때만 `SOMOIM_NOTIFY_MEMBERS=true`로 켠다.

**폼이 안 보인다고 제출된 것이 아니다.** uiautomator는 맨 위 창만 덤프하므로 폼을
덮는 창이 있으면 폼 노드가 통째로 사라진다. 실기기에서 두 번 당했다 — 사진
선택기(다른 패키지)가 덮었을 때, 그리고 앱 자신의 `잠시만 기다려주세요.` 로딩
다이얼로그가 덮었을 때. 그래서 성공 판정은 부재가 아니라 존재로 한다:
**만들어진 정모 게시글(`event_info`)이 보이고 제목이 payload와 같을 때만** 성공이다
(`evaluateSubmitOutcome`).

**uiautomator는 화면이 정착하기 전에 노드를 통째로 빠뜨린다.** 홈 화면이 다 로드된
덤프에 하단 탭 바가 하나도 없어서 job이 실패한 적이 있다. 한 번 읽고 판단하지 말고
폴링한다.

**uiautomator가 같은 창을 두 벌 덤프할 때가 있다.** bounds가 완전히 같은 노드가
중복으로 나온다. 개수를 세기 전에 bounds로 접는다(`uniqueByBounds`).

## 구조

```text
index.js              # claim → runJob → complete/fail 루프, 종료 시그널 처리
config.js             # 환경변수 → worker 설정
api-client.js         # 서버 job endpoint 호출 (x-internal-key)
job-runner.js         # job 하나 실행. dryRun/submit 안전장치와 실패 분기
adb.js                # 기기 목록 파싱·선택, 자동 재연결, shell/screenshot/uiautomator 래퍼
lock.js               # worker 중복 실행 방지(락 파일 + PID 확인)
placeholder-image.js  # 정모 사진용 단색 PNG 생성(의존성 없이)
errors.js             # ManualReviewError / TransientError
somoim-screen.js      # 화면 파싱·날짜 포맷·노드 찾기. 순수 함수
somoim-app.js         # 앱 화면 이동과 기기 조작 (adb)
somoim-form.js        # 정모 개설 폼의 규칙(길이 제한·기본값·제출 판정). 순수 함수
handlers/             # job type별 화면 자동화 (create_meetup, delete_meetup)
```

서버 통신(`api-client`)과 job 실행(`job-runner`)을 분리해서, 기기 없이도 안전장치와
실패 분기를 단위 테스트로 검증한다.

같은 이유로 순수한 것과 기기를 만지는 것을 나눈다. 의존은 한 방향으로만 흐른다:

```text
somoim-screen.js ← somoim-form.js ← handlers/
       ↑                              ↑
   somoim-app.js ────────────────────┘
```

`somoim-form.js`가 `somoim-app.js`를 import하면 "폼 규칙은 태블릿 없이 검증한다"는
말이 구조로는 성립하지 않는다. 순수한 쪽은 순수한 쪽만 의존한다.

worker는 시작할 때 락 파일을 잡는다. 기기는 한 대인데 job claim은 job 단위 원자성만
보장하므로, worker가 둘이면 같은 태블릿을 동시에 조작해 화면이 엉망이 된다. 이미
살아 있는 worker가 있으면 `worker_start_failed`를 남기고 종료한다. 크래시로 남은
락은 PID가 죽어 있으면 자동 회수한다.

## 실패 처리 원칙

확인할 수 없는 상태는 추측하지 않는다. handler가 던지는 에러는 다음과 같이 매핑된다.

- `ManualReviewError` → `needsManualReview: true`
- `TransientError` → `needsManualReview: false` (아무 입력도 하지 않은 상태의 명백한
  네트워크·앱 실행 timeout에만 쓴다)
- 그 밖의 모든 에러 → `needsManualReview: true` (애매하면 true)

기기를 확정할 수 없거나 dryRun/submit 조합이 잘못된 경우 handler는 아예 실행하지 않는다.

claim한 뒤 보고 없이 죽은 job은 서버가 다음 claim 때 회수해 재시도한다. **단 제출
버튼을 누른 뒤 끊긴 job은 재시도하지 않는다** — 규칙은
[SOMOIM_AUTOMATION.md](../SOMOIM_AUTOMATION.md)의 "Submit attempt"에 있다.

실패한 job이 마지막으로 본 화면은 `worker-artifacts/<job-id>/ui-dump.xml`에 남는다.
어느 화면에서 막혔는지는 이 파일이 가장 확실한 증거다.

worker 로그는 `timestamp`, `level`, `service`, `event`를 공통 필드로 갖는 JSON 한 줄이다.
job 실패에는 `jobId`, `jobType`, `stage`, `attempt`, `errorCode`, `retryable`,
`needsManualReview`, `submitAttempted`가 추가된다. Discord에는 서버가 더 재시도하지 않는
최종 실패와 worker 시작 실패만 전송한다. webhook 호출이 실패해도 job 처리 결과는 바뀌지
않으며, 같은 worker 프로세스에서는 `jobId:errorCode`가 같은 알림을 한 번만 보낸다.

Webhook URL은 Discord 채널의 **연동 → 웹후크**에서 발급해 `worker/.env`에만 둔다.
로그와 알림에는 내부 API 키, 전체 payload, 회원 정보, 화면 덤프를 넣지 않는다.

## 테스트

```bash
node --test test/worker.*.test.js
```
