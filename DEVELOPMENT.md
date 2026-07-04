# Development Notes

`AGENTS.md`(커밋 컨벤션, feature 패턴, 에러/인증/마이그레이션 규칙)와 겹치지 않는,
**살아있는 제품/데이터 설계 결정만** 남깁니다. 코딩 규칙을 찾는 중이면 `AGENTS.md`로.

## 데이터 모델

핵심 흐름: `users → meetups → participants → verifications → point_logs`.
소모임 크롤링 데이터(`somoim_*`)는 앱 데이터와 분리된 읽기전용 테이블입니다.

```text
users
- id, oauth_provider, nickname, avatar, total_points,
  active_badge_id(nullable FK badges.id, ON DELETE SET NULL), created_at
- total_points는 캐시. point_logs가 source of truth.
  불일치 시 point_logs로부터 재계산한다.
- active_badge_id는 헤더 아바타에 표시할 대표 뱃지. 뱃지 적용(apply) 시
  자동으로 갱신되고, /api/badges/:id/activate로 직접 바꿀 수 있다.

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

-- 소모임(somoim.co.kr) 크롤링 데이터 — 읽기전용, 앱 데이터와 별도 -----------

somoim_members                 -- 크롤링된 멤버. id가 users.id와 동일(FK 역할)
- id, name, bio, face_id(얼굴 이미지 UUID), avatar_url, source_url,
  created_at, updated_at

somoim_events                  -- 크롤링된 정모 일정
- id, source_url, title, scheduled_at(nullable — 파싱 실패 가능),
  location, cost, joined_count, capacity, thumbnail_url

somoim_event_attendees         -- 정모 참석자 (face_id로 매핑, 이름 미매핑 시 null 허용)
- id, event_id, face_id, member_name, created_at

somoim_sync_logs               -- 크롤링 동기화 이력(성공/실패, 인원 수 비교용)
- id, source_url, expected_count, crawled_count, upserted_count,
  status, error_message, synced_at

cafe_comments                  -- 카페별 한줄 코멘트 (방문 이력 있는 유저만 작성 가능)
- id, cafe_location, user_id, body(1~120자), created_at, updated_at
  (UNIQUE cafe_location+user_id — 유저당 카페 하나에 코멘트 하나, upsert)
```

전체 스키마와 변경 이력은 `migrations/`가 정답입니다. 위 요약이 실제 파일과
어긋나면 마이그레이션 쪽이 맞습니다 — 이 문서를 고치세요.

## 알려진 설계 한계

- **cafe_comments의 `cafe_location`이 문자열 그대로 키**: 앱 모임의 `location`
  ("아비아채")과 정모의 `location`("아비아채 지하1층")이 다른 문자열이라 같은
  카페인데도 다르게 집계됨. 정규화하려면 별도 카페 마스터 테이블이 필요.
- **인증은 auth.js가 `x-user-id` 헤더를 그대로 신뢰하는 임시 구현**
  (`AGENTS.md`의 "인증 경계" 참고). 실제 로그인으로 교체되기 전까지, 모든 권한
  로직은 이 위에 얹혀 있다는 걸 감안해야 함.
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
