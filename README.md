# CafeStudy

카페 스터디 모임 플랫폼 MVP. 

- **백엔드**: Express (Node 22, ESM)
- **프론트**: Vue 3 + Vite + Tailwind
- **DB**: PostgreSQL (Railway) · **스토리지**: S3 호환 · **배포**: Railway

---

## 빠른 시작

```bash
git clone https://github.com/sngmng6506/cafestudy.git
cd cafestudy
npm install
cp .env.example .env   # 값은 팀에게 따로 받아 채우기 (아래 참고)
```

두 개의 터미널에서:

```bash
npm run dev       # 백엔드 (http://localhost:3000)
npm run dev:web   # 프론트 (http://localhost:5173)  ← 브라우저로 여기 접속
```

`/api` 요청은 프론트(5173)에서 백엔드(3000)로 자동 프록시됩니다.

## 환경 변수 (`.env`)

`.env`는 깃에 올라가지 않습니다. `.env.example`을 복사한 뒤 값을 채우세요. **실제 값은 안전한 채널로 팀에게 요청**하세요 (채팅/깃에 올리지 말 것).

| 변수 | 용도 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 (Railway) |
| `NAVER_SEARCH_CLIENT_ID` / `NAVER_SEARCH_CLIENT_SECRET` | 모임 위치 장소 검색 |
| `AWS_*` (`ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `DEFAULT_REGION`, `ENDPOINT_URL`, `S3_BUCKET_NAME`) | 인증 사진 스토리지 |
| `NODE_ENV`, `PORT` | 실행 환경 |

> `.env`를 바꾸면 **백엔드를 재시작**해야 반영됩니다.

## 자주 쓰는 명령

```bash
npm run dev          # 백엔드 (src 변경 시 자동 재시작)
npm run dev:web      # 프론트 (Vite)
npm test             # 테스트 (node --test)
npm run build        # 프론트 빌드
npm run db:migrate   # DB 마이그레이션 적용
```

## ⚠️ 먼저 알아둘 점

- **로컬도 공유 Railway DB를 사용합니다** (별도 로컬 DB 없음). 로컬에서 만든 데이터가 공유 DB에 반영됩니다.
- **로그인은 아직 스텁 상태**입니다. 로컬에서는 모두가 같은 "데모 유저"로 동작해요 (호스트/참여/포인트가 한 명 기준). 실제 네이버 로그인은 추후 추가 예정.

---

## 기능(모듈) 추가하는 법

이 프로젝트는 **기능 단위 플러그인 구조**입니다. 기능 하나 = 폴더 하나 + 등록 한 줄.

**백엔드** — `src/features/<이름>/index.js`에 플러그인 계약을 export 하면 `core/loadFeatures.js`가 자동 등록합니다.

```js
import { createRouter } from './x.routes.js';

export default {
  name: 'x',
  basePath: '/api/x',
  createRoutes: (ctx) => createRouter(ctx), // ctx: { db, auth, storage, config }
};
```

- `src/features/_template/`를 시작점으로 복사하세요.
- 다른 기능을 직접 import하지 말고, 필요하면 DB로 소통합니다.
- 모든 API 응답은 `{ data, error }` 형태로 통일합니다.

**프론트** — `client/src/features/index.js`에 한 줄 등록합니다.

```js
{ name: 'x', label: '엑스', icon: SomeIcon, component: XPage, primary: true }
```

- `primary: true`면 하단 탭바에 고정, 없으면 **"더보기"** 시트로 모입니다.

**DB 변경** — `migrations/`에 타임스탬프 이름의 `.sql` 파일을 추가하고 `npm run db:migrate`를 실행합니다.

**디자인** — `DESIGN_GUIDE.md`의 토큰을 따릅니다 (모바일 우선, `max-w-md`, 하단 탭).

**테스트** — 새 동작에는 테스트를 추가합니다 (`test/*.test.js`, `node --test`).

## 배포

`main` 브랜치에 푸시하면 Railway가 자동 배포합니다. **새 환경 변수는 Railway에도** 추가해야 합니다 (로컬 `.env`와 별개).

## 더 읽기

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — 제품 범위, 아키텍처, 규칙
- [`DESIGN_GUIDE.md`](./DESIGN_GUIDE.md) — 디자인 시스템
