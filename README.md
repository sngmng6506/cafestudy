# CafeStudy

카페 스터디 모임을 만들고, 사진 인증으로 포인트를 쌓고, 랭킹으로 확인하는 MVP입니다.
앞으로 뭐가 추가될지 모릅니다

## Stack

- Backend: Express, Node.js 22, PostgreSQL
- Frontend: Vue 3, Vite, Tailwind CSS
- Storage: S3-compatible bucket on Railway
- Deploy: Railway

## Quick Start

```bash
git clone https://github.com/sngmng6506/cafestudy.git
cd cafestudy
npm install
copy .env.example .env
```

`.env` 값을 채운 뒤 터미널 2개를 켭니다.

```bash
npm run dev
```

```bash
npm run dev:web
```

접속:

```text
http://localhost:5173
```

Backend API는 `http://localhost:3000`에서 실행됩니다. Vite가 `/api` 요청을 backend로 proxy합니다.

`main`에 push하면 끝입니다 — Railway가 자동으로 빌드/배포하고, DB 마이그레이션도 배포 스크립트가 알아서 실행합니다. Railway 환경변수는 로컬 `.env`와 같은 값이 필요합니다(팀에 공유 요청). 배포 확인: https://cafestudy-production.up.railway.app/health

로컬 없이 바로 보려면 >> https://cafestudy-production.up.railway.app/

## Environment

`.env`는 git에 올라가지 않습니다. .env 값 공유는 메세지 주세요 

```env
NODE_ENV=
PORT=
DATABASE_URL=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=
AWS_ENDPOINT_URL=
AWS_S3_BUCKET_NAME=

NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
```


## Scripts

```bash
npm run dev         # backend server
npm run dev:web     # frontend dev server
npm test            # tests
npm run build       # frontend production build
npm run db:migrate  # 배포 파이프라인에서 자동 실행됨 — 로컬에서 직접 돌리지 말 것
```

## Current Features

- Home: 달력과 모임 요약, 소모임 정모 일정 통합 표시
- Meetups: 모임 생성, 장소 검색, 참여/취소
- Verifications: 사진 촬영, 압축, 업로드, 포인트 지급
- Ranking: 누적 랭킹, 월간 랭킹
- Members: 소모임 멤버 목록, 검색, 아바타
- Cafes: 방문한 카페 이력 + 한줄 코멘트
- History: 완료된 모임(앱+소모임) + 인증 사진 모아보기
- 주사위

## Changelog

최근 주요 변경은 `git log`를 참고하세요.
(커밋 규칙은 [AGENTS.md](./AGENTS.md) 참고 — `Why:`에 변경 배경이 남아있습니다.)

## Project Structure

```text
src/
  core/              # app infrastructure
  shared/            # shared backend helpers
  features/          # backend feature plugins

client/src/
  features/          # frontend feature tabs
  shared/            # shared frontend helpers

migrations/          # SQL migrations
test/                # node:test tests
```

## Adding a Backend Feature

새 backend 기능은 `src/features/<name>/`에 추가합니다.

```js
export default {
  name: 'example',
  basePath: '/api/example',
  createRoutes: (ctx) => createExampleRouter(ctx),
};
```

`core/loadFeatures.js`가 feature를 자동 등록합니다.

규칙:

- 다른 feature를 직접 import하지 않습니다.
- 필요한 공유 의존성은 `ctx`에서 받습니다.
- API 응답은 `{ data, error }` 형태를 유지합니다.

## Adding a Frontend Tab

새 화면은 `client/src/features/<name>/`에 만들고 `client/src/features/index.js`에 등록합니다.

```js
{
  name: 'example',
  label: '예시',
  icon: SomeIcon,
  component: ExamplePage,
}
```

## Database Changes

DB 변경은 `migrations/`에 SQL 파일로 추가합니다.

```text
migrations/20260621_add_example.sql
```

배포 시 자동 적용됩니다. **로컬에서 `npm run db:migrate`를 직접 돌리지 마세요** —
로컬 `DATABASE_URL`은 보통 팀이 공유하는 Railway DB를 가리키므로, "미리 확인"이
아니라 실제 운영 DB에 바로 적용됩니다. PR이 `main`에 머지되면 배포 파이프라인이
알아서 적용합니다.

## Design

디자인 기준은 [DESIGN_GUIDE.md](./DESIGN_GUIDE.md)를 따릅니다.
수정해도 ㄱㅊ 


## More Docs

- [AGENTS.md](./AGENTS.md): AI 코딩 규칙(커밋 컨벤션, 아키텍처 규칙) — Claude Code, Codex 등 공통
- [DEVELOPMENT.md](./DEVELOPMENT.md): product scope, architecture, collaboration rules
- [DESIGN_GUIDE.md](./DESIGN_GUIDE.md): UI design rules
