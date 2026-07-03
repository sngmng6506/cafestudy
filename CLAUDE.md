# CLAUDE.md

이 파일은 Claude Code(및 다른 AI 코딩 도구)가 이 저장소에서 작업할 때 따르는 규칙입니다.
사람이 직접 커밋할 때는 이 규칙에 얽매이지 않습니다 — **AI가 작업할 때만** 적용됩니다.

## 이 프로젝트

CafeStudy — 카페 스터디 모임 플랫폼. 여러 명이 AI를 써서 협업 개발하며, 계속 커집니다.
- Backend: Express / Node 22 / PostgreSQL (`src/`)
- Frontend: Vue 3 / Vite / Tailwind (`client/`)
- GitHub가 source of truth. 로컬 환경 없이 작업하는 기여자도 있음.

---

## 커밋 규칙 (AI가 커밋할 때)

### 1) 논리 단위로 쪼갠다
여러 성격의 변경(기능 + 리팩터 + 배포설정 등)을 한 커밋에 몰지 않는다.
"이 커밋만 되돌리면 이 변경만 사라진다"가 성립하도록 나눈다.
나중에 `git blame`/`git log`로 맥락을 추적할 때 정확도가 여기서 갈린다.

### 2) 각 커밋에 "왜"를 남긴다
메시지 형식:

```
<type>(<scope>): <무엇을 했는지 한 줄>

Why: <이 변경을 부른 요청/문제. 1-2줄. 필수>
Decision: <AI가 자율 판단한 부분과 근거. 판단이 개입했을 때만>

🤖 Generated with Claude Code
```

- `type`: feat / fix / refactor / chore / ci / docs / test
- `Why:`는 **필수**. "무엇"은 diff가 말해주니, 메시지엔 "왜"를 남긴다.
- `Decision:`은 AI가 스스로 판단해 고른 방식이 있을 때만 (예: "2차 다항식 대신
  비선형 함수로 일반화 — 향후 케이스 확장 대비"). 단순 작업엔 생략.
- 마지막 줄 `🤖 Generated with Claude Code`는 **AI 커밋 마커**. 유지한다.
  → 나중에 `git log --grep="🤖"`로 AI 작업만 필터링 가능. 사람 커밋과 구분된다.

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
- `ctx`(= `{ db, auth, storage, config }`)로만 의존성을 받는다. 전역 import 금지 —
  테스트에서 주입 가능해야 한다.

### 응답·에러
- 응답은 항상 `shared/api-response.js`의 `sendOk`/`sendFail` 형식(`{data, error}`).
- 도메인 에러는 `code`로 구분하고, 라우트에서 HTTP status로 매핑한다.
  (에러 표준화 리팩터가 예정되어 있으니, 새 코드도 `error.code`를 명확히 던질 것.)

### 인증 경계 — 중요
- 현재 `auth.js`는 `x-user-id` 헤더 기반의 **임시** 구현이다. 언젠가 실제 토큰
  검증으로 교체된다.
- 그러니 라우트/서비스는 **`req.user.id`(또는 `ctx.auth.userId(req)`)에만 의존**하고,
  헤더를 직접 읽지 않는다. auth 내부가 바뀌어도 나머지 코드가 안 깨지도록.

### DB 마이그레이션
- `migrations/`에 `YYYYMMDD_설명.sql`. 파일명 사전순으로 실행된다.
- **같은 날 여러 개면 순서가 겹치지 않게** 접미사로 구분 (`_1`, `_2` 또는 시각).
- 이미 적용된 마이그레이션 파일은 **수정하지 않는다**. 되돌리거나 바꾸려면 새 파일 추가.
  (migrate.js가 checksum으로 감지 — 적용된 파일이 바뀌면 배포가 에러로 중단된다.)
- 배포 시 `railway.json`의 startCommand가 `npm run db:migrate`를 자동 실행한다.
  (advisory lock으로 동시 실행은 직렬화됨.)

### Frontend
- 새 화면은 `client/src/features/<name>/`. `features/index.js`에 등록(탭 노출).
- 데이터 로직은 컴포넌트에 직접 쓰지 말고 `shared/`의 composable로 뺀다
  (`useMeetups.js` 참고). 도메인 변환 함수도 `shared/` 순수 함수로.
- 크롤링/외부 데이터를 `v-html`로 렌더할 때는 반드시 이스케이프(XSS).

---

## 테스트
- 순수 로직(파서·서비스)은 `test/`에 `node --test`로 단위 테스트 추가.
- DB가 필요한 통합 테스트는 `DATABASE_URL` 없으면 skip되도록 작성.
- 버그를 고치면 회귀 방지 테스트를 함께 추가한다.

## 하지 말 것
- 시크릿(토큰·키·비밀번호)을 코드/커밋/로그에 남기지 않는다.
- `app.js`에 라우트를 직접 추가하지 않는다 (feature 패턴 우회 금지).
- 큰 무관한 변경을 한 커밋에 섞지 않는다.
