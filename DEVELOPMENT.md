# Development Notes

`AGENTS.md`(커밋 컨벤션, feature 패턴, 에러/인증/마이그레이션 규칙)와 겹치지 않는,
**살아있는 제품/데이터 설계 결정만** 남깁니다. 코딩 규칙을 찾는 중이면 `AGENTS.md`로.

## 데이터 모델

핵심 흐름: `users → meetups → participants → verifications → point_logs`.
소모임 크롤링 데이터(`somoim_*`)는 앱 데이터와 분리된 읽기전용 테이블입니다.

```text
users
- id, oauth_provider, nickname, avatar, total_points,
  active_badge_id(nullable FK badges.id, ON DELETE SET NULL),
  password_hash(nullable), password_updated_at, is_admin(default false), created_at
- total_points는 캐시. point_logs가 source of truth.
  불일치 시 point_logs로부터 재계산한다.
- active_badge_id는 헤더 아바타에 표시할 대표 뱃지. 뱃지 적용(apply) 시
  자동으로 갱신되고, /api/badges/:id/activate로 직접 바꿀 수 있다.
- password_hash가 null이면 아직 비밀번호를 설정하지 않은 멤버
  (POST /api/auth/set-password로 최초 설정).

sessions                       -- 로그인 세션 (비밀번호 인증)
- token(PK), user_id(FK users, CASCADE), created_at, expires_at
- 로그인 성공 시 발급, 클라이언트는 Authorization: Bearer <token>으로 전송.
  전역 미들웨어(resolveUser)가 만료 전 세션만 인정.

meetups                        -- 앱 안에서 직접 만든 모임
- id, host_id, title, description, location, cafe_name(legacy, nullable),
  scheduled_at, capacity, status(open/closed), created_at

participants                   -- meetup 참가 (UNIQUE meetup_id+user_id)
- id, meetup_id, user_id, joined_at

verifications                  -- 사진 인증 (UNIQUE meetup_id+user_id, 1인 1회)
- id, meetup_id, user_id, photo_url, points_awarded,
  status(approved/rejected/pending), created_at

point_logs                     -- 포인트 원장. source: verify/host/dice
- id, user_id, source, ref_id, amount, created_at

badge_generations              -- AI 뱃지 생성 이력 (preview → applied)
- id, user_id, prompt, provider, model, image_object_key, point_cost,
  status(preview/applied), error_message, created_at

badges                         -- 생성 결과에서 확정된 뱃지
- id, title, description, image_object_key, provider, model, prompt,
  created_by, created_at

user_badges                    -- 유저가 보유한 뱃지 (PK user_id+badge_id)
- user_id, badge_id, awarded_at
- 인당 최대 5개 (badges.service.js MAX_BADGES_PER_USER가 검증 —
  DB 제약이 아니라 apply 트랜잭션의 user row 잠금 + 카운트로 보장)
- 삭제는 user_badges 행만 지운다. badges 행과 이미지 오브젝트는 즉시 지우지 않는다.
  미참조 badges와 이미지는 badges.gc.js가 배포 직후 한 번, 이후 매일 03:30 KST에
  최대 100개씩 반복 정리한다. BADGE_GC_SCHEDULE 환경변수로 스케줄을 재정의할 수 있다.

-- 소모임(somoim.co.kr) 크롤링 데이터 — 읽기전용, 앱 데이터와 별도 -----------
-- 동기화: (1) node-cron 정기 크롤링 — 하루 2회(새벽 2시·오후 6시 KST). 기본
--   스케줄은 members/index.js의 '0 2,18 * * *', CRAWL_SCHEDULE로 재정의.
--   (2) 사용자 갱신 버튼 — POST /api/members/refresh(공개, 5분 쿨타임 서버 강제).
--   쿨타임은 REFRESH_COOLDOWN_SEC 환경변수(초)로 재정의 가능: 0이면 쿨타임 없음
--   (디버깅용 — 평상시엔 이 변수를 두지 말 것), 미설정이면 기본 300초(5분).
--   둘 다 같은 서비스 인스턴스를 공유해 쿨타임 시계를 공유한다(정기 크롤 직후
--   버튼 중복 방지). 정기 크롤은 force=true로 쿨타임 무시.
--   SOMOIM_URL이 없으면 스케줄이 등록되지 않아 정기 동기화가 돌지 않는다.
--   실행 이력은 somoim_sync_logs. POST /api/members/sync(내부 키)는 크롤링 없이
--   외부에서 만든 데이터를 직접 주입하는 별도 경로.

somoim_members                 -- 크롤링된 멤버. id가 users.id와 동일(FK 역할)
- id, name, bio, face_id(얼굴 이미지 UUID), avatar_url, source_url,
  created_at, updated_at

somoim_events                  -- 크롤링된 정모 일정
- id, source_url, title, scheduled_at(nullable — 파싱 실패 가능),
  location, cost, joined_count, capacity, thumbnail_url

somoim_event_attendees         -- 정모 참석자 (face_id로 매핑, 이름 미매핑 시 null 허용)
- id, event_id, face_id, member_name, attendee_order, is_host, created_at
- attendee_order는 크롤링한 카드의 얼굴 표시 순서. is_host는 현재 소모임 UI에서
  첫 얼굴이 주최자로 보이는 관찰에 기반한 추정값(첫 참석자=true).

somoim_sync_logs               -- 크롤링 동기화 이력(성공/실패, 인원 수 비교용)
- id, source_url, expected_count, crawled_count, upserted_count,
  status, error_message, synced_at

cafe_comments                  -- 카페별 한줄 코멘트 (방문 이력 있는 유저만 작성 가능)
- id, cafe_location, user_id, body(1~120자), created_at, updated_at
  (UNIQUE cafe_location+user_id — 유저당 카페 하나에 코멘트 하나, upsert)

app_flags                      -- 앱 전역 토글 (현재 key: 'smashed' — 깨부수기 장난 모드)
- key(PK), value(boolean), updated_by(nullable FK — 의도적으로 채우지 않음,
  누가 깨부쉈는지 익명 보장), updated_at
- 전역 상태라 모든 사용자에게 공유됨. 클라이언트는 45초 폴링으로 동기화.

cafe_places                    -- 카페 위치 문자열 → 좌표 지오코딩 캐시 (네이버 장소 검색)
- location(PK, cafe_location과 같은 문자열 키), place_name, road_address,
  lat, lng(둘 다 null이면 검색 실패 기록), resolved_at
- 카페 목록 조회 시 미해석 위치를 요청당 최대 5개씩 lazy 지오코딩.
  실패 기록은 7일 뒤 재시도. 검색 API 미설정 시에는 기록하지 않음.
```

전체 스키마와 변경 이력은 `migrations/`가 정답입니다. 위 요약이 실제 파일과
어긋나면 마이그레이션 쪽이 맞습니다 — 이 문서를 고치세요.

## 알려진 설계 한계

- **cafe_comments의 `cafe_location`이 문자열 그대로 키**: 앱 모임의 `location`
  ("아비아채")과 정모의 `location`("아비아채 지하1층")이 다른 문자열이라 같은
  카페인데도 다르게 집계됨.
  (현재 완화: cafe_places 지오코딩으로 지도에서는 같은 좌표로 수렴해 보이지만,
  집계·코멘트는 여전히 문자열 단위로 분리된다.)
  해결 방향(미구현): 룰베이스 정규화는 한국 카페명 변형이 무한해 오류가 많으므로,
  집계는 원본대로 하되 주기적으로(cron) AI(OpenRouter+Claude Haiku)가 카페명 목록을
  같은 곳끼리 묶어 대표 이름을 정한다. 원본은 보존하고 `cafe_aliases` 매핑 테이블만
  관리해 안전하게 되돌릴 수 있게 한다. AI 호출 실패 시 원본 집계로 폴백.
  (사용자용 안내는 더보기 > 알려진 이슈 페이지에도 있음)
- **dev 환경에는 인증 폴백이 있음**: 인증은 비밀번호+세션 토큰으로 구현되어
  있지만(`AGENTS.md`의 "인증 경계" 참고), `NODE_ENV !== 'production'`에서는
  토큰 없이 `x-user-id` 헤더/데모 유저 폴백이 동작한다. 로컬에서 되던 권한
  동작이 프로덕션에서 401이 날 수 있으니, 권한 로직은 폴백이 아니라 실제
  로그인 기준으로 검증할 것.
- **로컬 전용 DB가 없음**: 로컬 `DATABASE_URL`이 보통 팀이 공유하는 Railway DB.
  마이그레이션을 로컬에서 직접 실행하지 않는다(`AGENTS.md` 참고).

## 포인트 규칙

```text
사진 인증(verify) = 10점   (verification.service.js: VERIFY_POINTS)
주사위(dice)       = 1~6점 (굴린 값 그대로)
모임 개설(host)     = 0점   (스팸 방지 목적으로 의도적으로 0 — 처음부터 고정)
```

`point_logs.source`는 `'verify' | 'host' | 'dice'`로 제약된다(DB CHECK 제약).
새 포인트 출처를 추가하면 마이그레이션으로 이 CHECK도 같이 넓혀야 한다.

## 트랜잭션 요구사항

사진 인증은 원자적으로 처리해야 한다 — 아래 세 쓰기가 하나의 트랜잭션이어야 함:

1. `verifications` insert
2. `point_logs` insert
3. `users.total_points` increment

세 개를 독립된 쿼리로 나눠 쓰지 않는다(`db.transaction()` 사용).

## 월간 랭킹 규칙

Asia/Seoul 타임존 기준으로 `point_logs.created_at`을 집계한다.

```text
created_at >= 이번 달 1일 00:00 (KST)
created_at <  다음 달 1일 00:00 (KST)
```
