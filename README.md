# CafeStudy

카페 스터디 모임을 만들고, 사진 인증으로 포인트를 쌓고, 랭킹으로 확인하는 MVP입니다.

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

## Environment

`.env`는 git에 올라가지 않습니다. .env 값 공유는 메세지 주세요 

```env
NODE_ENV=development
PORT=3000
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
npm run db:migrate  # apply SQL migrations
```

## Current Features

- Home: 달력과 모임 요약
- Meetups: 모임 생성, 장소 검색, 참여/취소
- Verifications: 사진 촬영, 압축, 업로드, 포인트 지급
- Ranking: 누적 랭킹, 월간 랭킹
- 주사위 

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

적용:

```bash
npm run db:migrate
```

## Design

디자인 기준은 [DESIGN_GUIDE.md](./DESIGN_GUIDE.md)를 따릅니다.

핵심:

- minimal UI
- Pretendard
- Tailwind CSS
- accent color: `#16A34A`
- avoid heavy shadows and excessive colors

## Deployment

`main` branch에 push하면 Railway가 배포합니다.

Railway에도 로컬 `.env`와 같은 종류의 환경변수가 필요합니다.

배포 확인:

```text
https://cafestudy-production.up.railway.app/health
https://cafestudy-production.up.railway.app/api/storage/status
```

## More Docs

- [DEVELOPMENT.md](./DEVELOPMENT.md): product scope, architecture, collaboration rules
- [DESIGN_GUIDE.md](./DESIGN_GUIDE.md): UI design rules
