# CafeStudy

카페 스터디 모임을 만들고, 사진 인증으로 포인트를 쌓고, 랭킹으로 확인하는 웹 서비스입니다.
여러 명이 AI를 활용해 협업 개발하고 있습니다.

**▶ 지금 바로 둘러보기: https://cafestudy-production.up.railway.app/**


## Features

- **Home** — 달력과 모임 요약, 소모임 정모 일정 통합 표시
- **Meetups** — 모임 생성, 장소 검색, 참여/취소
- **Verifications** — 사진 촬영, 압축, 업로드, 포인트 지급
- **Ranking** — 누적 랭킹, 월간 랭킹
- **Members** — 소모임 멤버 목록, 검색, 아바타
- **Cafes** — 방문한 카페 이력 + 한줄 코멘트
- **History** — 완료된 모임(앱+소모임) + 인증 사진 모아보기
- **주사위** — 굴려서 포인트 획득

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
cp .env.example .env    # Windows: copy .env.example .env
```

`.env` 값을 채운 뒤(아래 Environment 참고) 터미널 2개에서 각각 실행합니다.

```bash
npm run dev       # backend  → http://localhost:3000
npm run dev:web   # frontend → http://localhost:5173
```

프론트에 접속하면 됩니다(http://localhost:5173). Vite가 `/api` 요청을 backend로 proxy합니다.

배포는 자동입니다 — `main`에 push하면 Railway가 빌드/배포하고 DB 마이그레이션도
배포 스크립트가 실행합니다. 따로 할 일 없습니다.

## Environment

`.env`는 git에 올라가지 않습니다. 실제 값은 팀에 요청하세요.

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
npm run db:migrate  # 배포 시 자동 실행됨 — 로컬에서 직접 돌리지 말 것 (공유 DB에 바로 적용됨)
```

## Project Structure

```text
src/
  core/        # app 인프라 (db, auth, storage, loadFeatures)
  shared/      # 공유 backend 헬퍼 (에러, 응답 포맷)
  features/    # backend feature 플러그인

client/src/
  features/    # frontend 화면 (탭)
  shared/      # 공유 frontend 헬퍼 (composable, 컴포넌트)

migrations/    # SQL 마이그레이션
test/          # node:test 테스트
```

## Contributing

기여 방법과 코딩 규칙(커밋 컨벤션, feature 추가법, 마이그레이션 규칙 등)은
**[AGENTS.md](./AGENTS.md)** 하나에 정리돼 있습니다. AI 도구로 작업하든 직접 하든
같은 규칙을 따릅니다.

간단히:
- 새 기능은 기존 feature 패턴을 따른다 (`src/features/_template/` 복사).
- 커밋 메시지엔 "왜"를 남긴다.
- DB 변경은 `migrations/`에 SQL 파일 추가 (로컬에서 `db:migrate` 직접 실행 금지).

## Documentation

| 문서 | 무엇을 담는가 | 언제 보는가 |
|------|--------------|-------------|
| [README.md](./README.md) | 시작하기, 기능, 스크립트 | 프로젝트를 처음 볼 때 |
| [AGENTS.md](./AGENTS.md) | 코딩 규칙 — 커밋 컨벤션, feature 패턴, 에러/인증/마이그레이션 | 코드를 짜거나 커밋하기 전 |
| [CLAUDE.md](./CLAUDE.md) | AGENTS.md로의 포인터 | 안 봐도 됨 (도구 자동 인식용) |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 데이터 모델, 포인트 규칙, 트랜잭션, 설계 한계 | DB나 도메인 로직을 건드리기 전 |
| [DESIGN_GUIDE.md](./DESIGN_GUIDE.md) | 색상/타이포/컴포넌트 디자인 토큰 | UI를 만들거나 고치기 전 |

변경 이력은 `git log` 참고 (커밋에 배경이 `Why:`로 남아있습니다).
