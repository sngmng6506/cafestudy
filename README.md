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

아니면 >> https://cafestudy-production.up.railway.app/

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

- Home: 달력과 모임 요약, 소모임 정모 일정 통합 표시
- Meetups: 모임 생성, 장소 검색, 참여/취소
- Verifications: 사진 촬영, 압축, 업로드, 포인트 지급
- Ranking: 누적 랭킹, 월간 랭킹
- Members: 소모임 멤버 목록, 검색, 아바타
- Cafes: 방문한 카페 이력 + 한줄 코멘트
- History: 완료된 모임(앱+소모임) + 인증 사진 모아보기
- 주사위

## Changelog

최근 주요 변경만 정리합니다. 전체 이력은 `git log`를 참고하세요
(커밋 규칙은 [CLAUDE.md](./CLAUDE.md) 참고 — `Why:`에 변경 배경이 남아있습니다).

### 2026-07-02 — 협업 확장 기반 정비
- **커밋 컨벤션 도입**: AI가 커밋할 때 `Why:`/`Decision:`을 남기도록 [CLAUDE.md](./CLAUDE.md) 추가.
  git history만으로 "왜 이렇게 바뀌었는지" 추적 가능하게.
- **에러 처리 표준화**: feature마다 제각각이던 에러 던지기 방식(4가지)을
  `shared/errors.js`로 통합. 라우트는 `next(error)`로 통일, HTTP status 매핑 자동화.
- **마이그레이션 안전장치**: 이미 적용된 마이그레이션 파일이 나중에 수정되면
  checksum으로 감지해 배포를 중단시킴(협업 중 흔한 실수 방지).
- **프론트 도메인 로직 통합**: 소모임 정모 변환/아바타 스택 계산이 여러 화면에
  복붙돼 있던 것을 `shared/useSomoimEvents.js`로 통합.
- **CI 추가**: PR/push마다 GitHub Actions로 테스트+빌드 자동 검증.
- **UI/UX 개선**: 소모임 정모 카드를 앱 자체 모임과 시각적으로 구분(배지+보더),
  참석자를 아바타 스택으로 표시, 캘린더 접근성(aria-label) 보강, 아바타 색상
  WCAG AA 대비 충족, 카페 코멘트 글자수 카운터 등.

### 2026-07-01 — 소모임 정모 크롤링
- 소모임(somoim.co.kr) 페이지에서 멤버 목록뿐 아니라 **정모 일정**(제목/일시/장소/
  비용/참가인원)까지 크롤링하도록 확장.
- 정모 참석자를 얼굴 이미지 UUID로 멤버와 매핑(`face_id`), 이름 미매핑 시 null 허용.
- 배포 파이프라인(`railway.json`)에 `db:migrate` 자동 실행 + advisory lock으로
  동시 배포 시 마이그레이션 경합 방지.
- NULL 날짜 정모 중복 증식, 유령 정모(수정/삭제 미반영) 등 초기 버그 수정.

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
수정해도 ㄱㅊ 


## Deployment

`main` branch에 push하면 Railway가 배포합니다.

Railway에도 로컬 `.env`와 같은 종류의 환경변수가 필요합니다.

배포 시작 커맨드(`railway.json`)가 서버 기동 전에 `npm run db:migrate`를 자동으로 실행합니다.
이미 적용된 마이그레이션은 건너뛰므로 매 배포마다 실행돼도 안전합니다. 수동 실행이 필요하면:

```bash
npm run db:migrate
```

배포 확인:

```text
https://cafestudy-production.up.railway.app/health
https://cafestudy-production.up.railway.app/api/storage/status
```

## More Docs

- [CLAUDE.md](./CLAUDE.md): AI 코딩 규칙(커밋 컨벤션, 아키텍처 규칙)
- [DEVELOPMENT.md](./DEVELOPMENT.md): product scope, architecture, collaboration rules
- [DESIGN_GUIDE.md](./DESIGN_GUIDE.md): UI design rules
