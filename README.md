# CafeStudy

카페 스터디 모임을 만들고, 사진 인증으로 포인트를 쌓고, 랭킹으로 확인하는 웹 서비스입니다.
여러 명이 AI를 활용해 협업 개발하고 있습니다. 쓸모없는 기능, 오버엔지니어링 환영합니다.

**▶ 지금 바로 둘러보기: https://cafestudy-production.up.railway.app/**

## Features

- **Home** — 달력과 모임 요약, 소모임 정모 일정 통합 표시
- **Meetups** — 모임 생성, 장소 검색, 참여/취소
- **Verifications** — 참석자 인증 대기 확인, 사진 촬영, 압축, 업로드, 포인트 지급
- **Ranking** — 누적 랭킹, 월간 랭킹
- **Members** — 소모임 멤버 목록, 검색, 아바타, 멤버 프로필 카드
  (포인트·활동 통계·뱃지 컬렉션)
- **Notices** — 공지 목록, 우상단 종 알림, 사용자별 읽음 상태와 미확인 개수
- **Admin** — 관리자 공지 작성·수정·삭제, 최고 관리자(owner)의 관리자 임명·해제
- **Settlements** — 모임 참여자가 1차·2차·… n차 정산을 추가하고 차수별 총액·참여자별 금액, 계좌·카카오페이 정보, 송금 완료 상태 확인
- **Badges** — AI 기반 뱃지 생성, 미리보기, 내 뱃지 적용·대표 뱃지 변경·삭제
  (인당 최대 5개). 대표 뱃지는 헤더·멤버 목록·모임 참석자·랭킹에 아바타로 표시
- **Cafes** — 방문한 카페 이력 + 한줄 코멘트 + 지도 뷰(마커 탭 → 카페 정보·
  코멘트·내가 참여한 모임의 인증 사진)
- **History** — 완료된 모임(앱+소모임) + 인증 사진 모아보기
- **알려진 이슈** — 현재 확인된 제품 제약과 사용 시 주의사항 안내
- **주사위** — 굴려서 포인트 획득
- **2048** — 숫자 합치기 미니게임, 최고점수 DB 저장 + 랭킹
- **자연어 기능 검색** — 홈 탭에서 검색 캡슐에 하고 싶은 일을 한국어 문장으로 입력하면 관련 기능 추천
- **검색 안내** — 자연어 검색이 어떻게 동작하는지 설명하는 안내 페이지
- **기능 휠** — 더보기를 누르면 탭바에 없는 기능들이 반원 휠로 펼쳐짐. 드래그/
  스와이프로 관성 회전하고 가까운 항목이 12시 위치로 스냅되며, 탭하면 이동
- **접속 QR** — 모바일 접속 주소를 QR 코드로 표시 + 주소 복사
- **깨부수기** — 더보기 휠의 장난 토글. 누르면 전체 UI가 와장창 깨지고,
  깨진 상태에서는 '원래대로'로 바뀌어 복구 가능

모바일 우선 UI이며 키보드 접근성, 핀치 확대, 안전 영역을 지원합니다.

## Stack

- Backend: Express, Node.js 22, PostgreSQL
- Frontend: Vue 3, Vite, Tailwind CSS
- Browser embedding: `@ternlight/mini` (WASM)
- Storage: S3-compatible bucket on Railway
- Deploy: Railway

## Deployment

운영 환경은 Railway입니다. `main`에 변경이 머지되면 Railway가 자동으로 빌드·배포하고,
배포 스크립트가 DB 마이그레이션을 실행합니다.

실제 환경변수 값은 Railway 프로젝트의 **Variables**에서 관리합니다. 저장소의
[`.env.example`](./.env.example)은 Railway에 필요한 키와 기본값을 확인하는 문서이며,
실제 비밀값을 저장하지 않습니다.

주요 설정 범주는 다음과 같습니다.

- 서버·DB: `NODE_ENV`, `PORT`, `DATABASE_URL`
- 오브젝트 스토리지: `AWS_*`
- 장소 검색: `NAVER_SEARCH_*`
- AI 뱃지 생성: `HF_*`
- 소모임 동기화·자동 크롤링: `INTERNAL_API_KEY`, `SYNC_ENDPOINT`, `SOMOIM_URL`, `CRAWL_SCHEDULE`
- Puppeteer 실행 환경: `PUPPETEER_*`

새 환경변수를 추가하거나 이름을 바꿀 때는 Railway Variables와 `.env.example`을 함께 갱신합니다.


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

AI 작업 규칙은 [AGENTS.md](./AGENTS.md)를 따릅니다. 사람이 직접 작업할 때도
아키텍처·보안·마이그레이션 불변식은 동일하게 유지합니다.

간단히:
- 새 기능은 기존 feature 패턴을 따른다 (`src/features/_template/` 복사).
- AI 커밋은 메시지에 변경 이유와 사용 도구·모델을 남긴다.
- DB 변경은 `migrations/`에 새 SQL 파일로 추가한다.
- 로컬에서 `npm run db:migrate`를 직접 실행하지 않는다.

## Documentation

| 문서 | 무엇을 담는가 | 언제 보는가 |
|------|--------------|-------------|
| [README.md](./README.md) | 배포 방식, 기능, 스크립트 | 프로젝트를 처음 볼 때 |
| [AGENTS.md](./AGENTS.md) | AI 작업 규칙과 아키텍처·보안 불변식 | AI로 코드를 짜거나 커밋하기 전 |
| [ROADMAP.md](./ROADMAP.md) | 앞으로 구현하면 좋은 기능 후보와 검색 개선 계획 | 구현할 기능을 고를 때 |
| [SOMOIM_AUTOMATION.md](./SOMOIM_AUTOMATION.md) | 소모임 앱 자동화 job API 계약, worker payload, dry-run/submit 규칙 | 미니PC worker나 소모임 자동화 API를 만들 때 |
| [CLAUDE.md](./CLAUDE.md) | AGENTS.md로의 포인터 | 안 봐도 됨 (도구 자동 인식용) |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 데이터 모델, 포인트 규칙, 트랜잭션, 설계 한계 | DB나 도메인 로직을 건드리기 전 |
| [DESIGN_GUIDE.md](./DESIGN_GUIDE.md) | semantic token, 색상, 타이포, 컴포넌트, 접근성 | UI를 만들거나 고치기 전 |
| [WRITING_GUIDE.md](./WRITING_GUIDE.md) | 사용자 문구의 목소리, 용어, 버튼·빈 상태·오류 기준 | 사용자에게 보이는 문구를 만들거나 고치기 전 |

변경 이력은 `git log` 참고 (AI 커밋에는 배경이 `Why:`로 남아 있습니다).
