# AGENTS.md

이 파일은 AI 코딩 에이전트(Claude Code, Codex CLI, Cursor 등)가 이 저장소에서
작업할 때 따르는 규칙입니다. 대부분의 에이전트가 AGENTS.md를 표준으로 읽습니다.
사람이 직접 커밋할 때는 이 규칙에 얽매이지 않습니다 — **AI가 작업할 때만** 적용됩니다.

## 이 프로젝트

CafeStudy — 카페 스터디 모임 플랫폼. 여러 명이 AI를 써서 협업 개발하며, 계속 커집니다.
- Backend: Express / Node 22 / PostgreSQL (`src/`)
- Frontend: Vue 3 / Vite / Tailwind (`client/`)
- GitHub가 source of truth. 로컬 환경 없이 작업하는 기여자도 있음.

## 관련 문서 (필요할 때 찾아볼 것)

이 파일은 **코딩 규칙**만 다룬다. 아래는 다른 정보가 필요할 때:
- [README.md](./README.md) — 시작하기, 현재 기능 목록, 스크립트
- [ROADMAP.md](./ROADMAP.md) — 앞으로 구현하면 좋은 기능 후보
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 데이터 모델(스키마), 포인트 규칙, 트랜잭션
  요구사항, 알려진 설계 한계. **DB나 도메인 로직을 건드리기 전에 읽을 것.**
- [DESIGN_GUIDE.md](./DESIGN_GUIDE.md) — semantic token, 색상, 타이포, 컴포넌트, 접근성.
  **UI를 만들거나 고치기 전에 읽을 것.**
- [WRITING_GUIDE.md](./WRITING_GUIDE.md) — 사용자 문구의 목소리, 용어, 버튼·빈 상태·오류 기준.
  **사용자에게 보이는 문구를 추가하거나 수정하기 전에 읽을 것.**

---

## 커밋 규칙 (AI가 커밋할 때)

### 1) 논리 단위로 쪼갠다
여러 성격의 변경(기능 + 리팩터 + 배포설정 등)을 한 커밋에 몰지 않는다.
"이 커밋만 되돌리면 이 변경만 사라진다"가 성립하도록 나눈다.
나중에 `git blame`/`git log`로 맥락을 추적할 때 정확도가 여기서 갈린다.

### 2) 각 커밋에 "왜"와 사용 모델을 남긴다
메시지 형식:

```
<type>(<scope>): <무엇을 했는지 한 줄>

Why: <이 변경을 부른 요청/문제. 1-2줄. 필수>
Decision: <AI가 자율 판단한 부분과 근거. 판단이 개입했을 때만>

🤖 Generated with <도구 이름> / <모델 이름>
```

예시:

```
feat(menu-search): add semantic menu navigation

Why: 사용자가 메뉴 이름을 몰라도 자연어로 원하는 기능에 접근할 수 있어야 합니다.
Decision: 모바일 번들 크기를 줄이기 위해 서버 모델 대신 브라우저 임베딩을 선택했습니다.

🤖 Generated with ChatGPT / GPT-5.6 Thinking
```

- `type`: feat / fix / refactor / chore / ci / docs / test
- `Why:`는 **필수**. "무엇"은 diff가 말해주니, 메시지엔 "왜"를 남긴다.
- `Decision:`은 AI가 스스로 판단해 고른 방식이 있을 때만 (예: "2차 다항식 대신
  비선형 함수로 일반화 — 향후 케이스 확장 대비"). 단순 작업엔 생략.
- 마지막 줄은 **AI 커밋 마커**이며, 실제 사용한 **도구 이름과 모델 이름을 모두** 쓴다.
  - 도구 예: ChatGPT / Claude Code / Codex CLI / Cursor
  - 모델 예: GPT-5.6 Thinking / Claude Sonnet 4.6 / GPT-5.3-Codex
  - 모델명을 도구에서 확인할 수 없으면 임의로 추측하지 말고 `model unknown`으로 쓴다.
- 표준 형식은 `🤖 Generated with <도구> / <모델>`이다. 단순히
  `🤖 Generated with ChatGPT`처럼 모델을 생략하지 않는다.
- 이 마커를 유지하면 `git log --grep="🤖"`로 AI 작업을 필터링하고, 도구·모델별로
  변경 품질이나 작업 성향을 나중에 비교할 수 있다.

### 3) 코드를 수정하기 전에 맥락을 확인한다
기존 코드를 고치거나 되돌리기 전에, 그 코드가 왜 그렇게 됐는지 먼저 확인한다:

```bash
git log --oneline -- <파일>      # 이 파일의 변경 흐름
git log -p -S "<코드조각>"        # 특정 코드가 언제/왜 들어왔는지
git blame <파일>                 # 줄 단위 출처
```

특히 "이상해 보여서 고치는" 코드일수록 먼저 `Why:`를 확인한다.
멀쩡한 의도가 있는데 맥락을 몰라 되돌리는 것이 가장 흔한 회귀 원인이다.
(예: 참석자 "외 N명" 표기는 참여 인원과 매핑된 이름 수의 불일치를 감추기 위한
의도적 설계다 — diff만 보고 단순화하면 버그가 된다.)

---

## 아키텍처 규칙 (AI·사람 공통으로 지킬 것)

새 기능은 기존 패턴을 그대로 따른다. 협업자가 늘어도 구조가 흔들리지 않도록.

### Backend: feature 플러그인 패턴
- 새 기능은 `src/features/<name>/`에 추가. `src/features/_template/`을 복사해 시작.
- 각 feature는 `index.js`(컨트랙트) + `<name>.routes.js` + `<name>.service.js`
  + `<name>.queries.js` 계층을 지킨다. routes=HTTP, service=도메인 로직, queries=SQL.
- `index.js`는 `{ name, basePath, createRoutes(ctx), onLoad?(ctx) }`를 default export.
  `loadFeatures.js`가 자동 등록하므로 app.js를 건드릴 필요 없다.

  ```js
  export default {
    name: 'example',
    basePath: '/api/example',
    createRoutes: (ctx) => createExampleRouter(ctx),
  };
  ```

- `ctx`(= `{ db, auth, storage, config }`)로만 의존성을 받는다. 전역 import 금지 —
  테스트에서 주입 가능해야 한다.
- 다른 feature를 직접 import하지 않는다. 필요한 공유 의존성은 `ctx`에서 받는다.

### 응답·에러
- 응답은 항상 `shared/api-response.js`의 `sendOk`/`sendFail` 형식(`{data, error}`).
- 도메인 에러는 `shared/errors.js`의 `throwValidation`/`throwNotFound`/`throwForbidden`/
  `throwConflict`(또는 `throwError(statusCode, code, message)`)로 던진다. 라우트에서
  수동으로 status를 매핑하지 않는다 — `next(error)`만 하면 전역 에러 핸들러가
  `error.statusCode`/`error.code`를 읽어 자동으로 응답한다.

### 인증 경계 — 중요
- 인증은 **비밀번호 + 세션 토큰** 방식이다: 로그인(`POST /api/auth/login`) 성공 시
  세션 토큰 발급 → 클라이언트가 `Authorization: Bearer <token>` 전송 → 전역
  `resolveUser`가 `sessions`와 현재 DB 역할을 조회해 `req.user`를 세팅한다.
- 역할은 `member | admin | owner`. `users.is_admin`은 legacy 호환 컬럼일 뿐 새 권한
  판단에 직접 사용하지 않는다.
- owner의 source of truth는 `app_owner.user_id` 단일 UUID다. 닉네임 `이상명` 비교나
  localStorage 값으로 owner를 추측하지 않는다.
- 관리자 라우트는 `ctx.auth.requireAdmin`, owner 전용 라우트는 반드시
  `ctx.auth.requireOwner`를 사용한다. `requireOwner ?? requireAdmin` 같은 fail-open
  폴백은 금지하며, 미들웨어가 없으면 시작 단계에서 실패시킨다.
- 프론트는 로그인 응답과 `GET /api/auth/me`의 `adminRole`을 그대로 사용한다.
  이름이나 `isAdmin` boolean만으로 owner를 추론하지 않는다.
- 비밀번호가 없는 계정도 `memberId`만으로 설정할 수 없다. admin/owner가 발급한
  `password_setup_tokens` 일회용 코드가 항상 필요하다. 코드 원문은 DB·로그에 저장하지 않는다.
- 비밀번호 설정 코드 발급 계층: admin → member만, owner → admin/member. owner 계정은
  애플리케이션에서 초기화하지 않는다. 발급 시 대상의 기존 세션과 이전 코드를 삭제한다.
- 라우트/서비스는 **`req.user.id`(또는 `ctx.auth.userId(req)`)에만 의존**하고,
  헤더나 세션 테이블을 직접 읽지 않는다. auth 내부가 바뀌어도 나머지 코드가 안 깨지도록.
- dev 환경(`NODE_ENV !== 'production'`)에서는 토큰 없이 `x-user-id` 헤더 폴백이
  아직 동작한다(로컬 개발 편의). 프로덕션 권한 검증 테스트는 실제 세션 역할로 작성한다.

### DB 마이그레이션
- `migrations/`에 `YYYYMMDD_설명.sql`. 파일명 사전순으로 실행된다.
- **같은 날 여러 개면 순서가 겹치지 않게** 접미사로 구분 (`_1`, `_2` 또는 시각).
- 이미 적용된 마이그레이션 파일은 **수정하지 않는다**. 되돌리거나 바꾸려면 새 파일 추가.
  (migrate.js가 checksum으로 감지 — 적용된 파일이 바뀌면 배포가 에러로 중단된다.)
- 배포 시 `railway.json`의 startCommand가 `npm run db:migrate`를 자동 실행한다.
  (advisory lock으로 동시 실행은 직렬화됨.)
- **로컬에서 `npm run db:migrate`를 실행하지 않는다.** 이 프로젝트는 로컬 전용
  DB가 없어 로컬 `DATABASE_URL`이 보통 팀이 공유하는 Railway DB를 가리킨다.
  로컬 실행은 "미리보기"가 아니라 PR 머지 전에 운영 DB를 바로 바꾸는 행위다.
  마이그레이션 SQL 문법만 확인하고 싶으면 파일 내용을 검토하는 것으로 충분하다.

### Frontend
- 새 화면은 `client/src/features/<name>/`. `features/index.js`에 등록(탭 노출).

  ```js
  { name: 'example', label: '예시', icon: SomeIcon, component: ExamplePage }
  ```

- 데이터 로직은 컴포넌트에 직접 쓰지 말고 `shared/`의 composable로 뺀다
  (`useMeetups.js` 참고). 도메인 변환 함수도 `shared/` 순수 함수로.
- 크롤링/외부 데이터를 `v-html`로 렌더할 때는 반드시 이스케이프(XSS).
- 원시 팔레트는 `client/src/styles.css`, semantic 역할은 `client/src/semantic-tokens.css`에서 관리한다.
- 새 UI 코드에서 hex 색상과 `text-[#...]`/`bg-[#...]`를 직접 추가하지 않는다. 역할에 맞는
  `--ui-*` 토큰 또는 `.ui-*` 클래스를 사용한다. 도메인 전용 색상도 반복되면 token으로 승격한다.
- radius와 타이포는 Tailwind 기본 단계를 감각적으로 고르지 말고 `DESIGN_GUIDE.md`의 역할 규칙을 따른다.
- 사용자 문구는 `WRITING_GUIDE.md`의 용어와 해요체를 따른다. `확인`·`계속`처럼 결과가
  모호한 버튼 라벨을 새로 만들지 않는다.
- 모든 인터랙티브 요소에 키보드 포커스가 보여야 하며 아이콘 버튼에는 `aria-label`을 둔다.

---

## 문서 갱신
- 사용자에게 보이는 기능을 추가하거나 바꾸면 `README.md`의 Features 섹션도 함께 갱신한다.
- 새 문서 파일을 추가하면 `README.md`의 Documentation 표에 링크를 추가한다.
- 새 문서가 특정 작업 규칙이나 도메인 판단에 필요하면 `AGENTS.md`의 관련 문서 목록에도 연결한다.
- 디자인 토큰·컴포넌트 규칙을 바꾸면 코드와 `DESIGN_GUIDE.md`를 같은 PR에서 갱신한다.
- 공통 용어·말투·UX 문구 패턴을 바꾸면 코드와 `WRITING_GUIDE.md`를 같은 PR에서 갱신한다.
- 앞으로 구현할 아이디어는 기능 구현과 섞지 말고 `ROADMAP.md`에 남긴다.

## 테스트
- 순수 로직(파서·서비스)은 `test/`에 `node --test`로 단위 테스트 추가.
- DB가 필요한 통합 테스트는 `DATABASE_URL` 없으면 skip되도록 작성.
- 버그를 고치면 회귀 방지 테스트를 함께 추가한다.
- 인증 변경은 최소한 owner/admin/member 역할 조합, 설정 코드 재사용, owner 보호를 테스트한다.
- UI 변경은 최소한 build와 주요 상태(기본, loading, empty, error, disabled)를 확인한다.

## 하지 말 것
- 시크릿(토큰·키·비밀번호)을 코드/커밋/로그에 남기지 않는다.
- `app.js`에 라우트를 직접 추가하지 않는다 (feature 패턴 우회 금지).
- 큰 무관한 변경을 한 커밋에 섞지 않는다.
