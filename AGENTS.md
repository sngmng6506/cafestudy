# AGENTS.md

AI 코딩 에이전트가 이 저장소에서 작업할 때 따르는 핵심 규칙이다.

## 프로젝트

CafeStudy — Express/Node 22/PostgreSQL 백엔드와 Vue 3/Vite/Tailwind 프론트엔드.
GitHub가 source of truth이며 로컬 환경 없이 작업하는 기여자도 있다.

## 관련 문서

- [README.md](./README.md) — 시작하기, 기능, 스크립트
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 데이터 모델, 도메인 불변식, 트랜잭션, 설계 한계
- [SOMOIM_AUTOMATION.md](./SOMOIM_AUTOMATION.md) — 소모임 자동화 API와 worker 계약
- [worker/README.md](./worker/README.md) — worker 실행과 앱 자동화 노트
  (태블릿 셋업 절차는 [worker/TABLET_SETUP.md](./worker/TABLET_SETUP.md))
- [DESIGN_GUIDE.md](./DESIGN_GUIDE.md) — UI 토큰, 컴포넌트, 접근성
- [WRITING_GUIDE.md](./WRITING_GUIDE.md) — 사용자 문구와 UX 용어
- [ROADMAP.md](./ROADMAP.md) — 미구현 아이디어

## 커밋 규칙

- 독립적으로 되돌릴 수 있는 논리 단위로 커밋한다.
- 형식:

```text
<type>(<scope>): <summary>

Why: <변경 이유>
Decision: <판단이 개입된 경우만>

🤖 Generated with <tool> / <model>
```

- type: `feat`, `fix`, `refactor`, `chore`, `ci`, `docs`, `test`.
- 기존 코드를 수정하기 전 `git log`, `git blame`으로 의도를 확인한다.

## Backend feature 규칙

- 새 기능은 `src/features/<name>/`에 추가하고 `_template` 구조를 따른다.
- 계층: `index.js` → routes → service → queries.
- feature contract는 `{ name, basePath, createRoutes(ctx), onLoad?(ctx) }`다.
- `basePath`는 feature마다 고유해야 한다.
- 비동기 `onLoad(ctx)`는 초기화가 끝날 때까지 반환하지 않는다.
- 환경 의존 설정은 composition root의 `createConfig()`에서 만들고 `ctx.config`로 주입한다.
- 의존성은 `ctx = { db, auth, storage, config }`로 주입한다. feature 간 직접 import 금지.
- feature끼리 알려야 할 일이 있으면 `ctx.hooks`를 쓴다. `onLoad(ctx)`에서
  `ctx.hooks.on(event, listener)`으로 구독하고, 이벤트를 내는 쪽은 누가 듣는지 모른다.
  `emit`은 리스너 반환값을 배열로 돌려주므로, 각 feature가 자기 테이블만 갱신한다.
- 프론트·백엔드 공통 제한값은 `shared/domain-constraints.js`에 둔다.
- `app.js`에 feature 라우트를 직접 추가하지 않는다.

## 응답과 오류

- 응답은 `sendOk`/`sendFail` 형식(`{ data, error }`)을 사용한다.
- 도메인 오류는 `shared/errors.js` helper로 던지고 라우트는 `next(error)`만 호출한다.
- 예상하지 못한 5xx의 message, stack, 내부 주소는 로그에만 남기고 응답에 노출하지 않는다.

## 인증 경계

- 인증 source of truth는 서버 세션과 `req.user`다.
- 역할은 `member | admin | owner`; owner 기준은 `app_owner.user_id`다.
- 이름, localStorage, `users.is_admin`으로 권한을 추론하지 않는다.
- 관리자/owner 라우트는 각각 `requireAdmin`, `requireOwner`를 사용한다.
- 라우트·서비스는 `req.user.id` 또는 `ctx.auth.userId(req)`에 의존한다.
- 비밀번호 설정·초기화·역할 변경은 기존 서비스의 원자성 규칙을 유지한다.
- dev의 `x-user-id` 폴백을 프로덕션 권한 검증에 사용하지 않는다.

## DB 마이그레이션

- `migrations/YYYYMMDD_설명.sql`; 같은 날짜면 접미사로 순서를 구분한다.
- 이미 적용된 마이그레이션은 수정하지 않고 새 파일로 변경한다.
- 배포 시 migration은 자동 실행된다.
- 로컬 `DATABASE_URL`은 공유 Railway DB일 수 있으므로 `npm run db:migrate`를 로컬에서 실행하지 않는다.

## Frontend

- 새 화면은 `client/src/features/<name>/`에 두고 `features/index.js`에 등록한다.
- 페이지 제목은 `features/index.js`의 `title`에 둔다. 셸(`App.vue`)이 제목과 알림·프로필을
  한 헤더로 그리므로 화면 안에서 `<h1>`을 따로 렌더하지 않는다.
- 하단 바에 탭은 없다. 등록한 화면은 모두 `더보기` 메뉴로 들어가며 `order`가 순서를
  정한다. 하단 바가 소유하는 것은 `모임 만들기`와 기능 검색·`더보기`뿐이다.
- 로그인해야 쓸 수 있는 화면은 `memberOnly: true`로 표시한다. 게스트에게는 잠금으로
  보이고 누르면 로그인 안내가 뜬다. 서버 라우트의 인증 요구와 어긋나지 않게 맞춘다.
- 새 화면은 `test/guest-gate.test.js`의 목록에도 넣는다. 게스트에게 보일지 한 번은
  의식적으로 정하게 하는 장치라, 넣지 않으면 테스트가 실패한다.
- 자연어 기능 검색에 노출할 화면은 `features/index.js`의 `name`과 같은 `featureName`으로
  `client/src/features/menu-search/menu-search.metadata.js`에 `description`, `searchTerms`,
  `examples`를 함께 등록한다. Ternlight WASM은 이 문장들을 임베딩하며, 등록하지 않은
  기능은 검색되지 않는다.
- 데이터·셸 로직은 컴포넌트에 쌓지 말고 `client/src/shared/` composable로 분리한다.
- 외부 데이터를 `v-html`로 렌더할 때는 이스케이프한다.
- 새 UI에서 hex 색상을 직접 추가하지 말고 semantic token을 사용한다.
- UI는 `DESIGN_GUIDE.md`, 사용자 문구는 `WRITING_GUIDE.md`를 따른다.
- 인터랙티브 요소에는 보이는 키보드 포커스와 필요한 `aria-label`을 제공한다.

## 테스트

- 순수 로직은 `node:test` 단위 테스트를 추가한다.
- DB 통합 테스트는 `DATABASE_URL`이 없으면 skip한다.
- 버그 수정에는 회귀 방지 테스트를 추가한다.
- 인증 변경은 역할 조합과 owner 보호를 검증한다.
- UI 변경은 build와 주요 상태를 확인한다.

## 문서 갱신

- 사용자 기능 변경은 README, 도메인 결정은 DEVELOPMENT, 디자인은 DESIGN_GUIDE,
  사용자 문구 규칙은 WRITING_GUIDE에 반영한다.
- 새 문서는 README와 이 파일의 관련 문서 목록에 연결한다.
- 미구현 아이디어는 ROADMAP에 남긴다.

## 금지

- 시크릿을 코드, 커밋, 로그에 남기지 않는다.
- 무관한 변경을 한 커밋에 섞지 않는다.
