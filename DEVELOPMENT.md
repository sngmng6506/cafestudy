# Development Notes

`AGENTS.md`(커밋 컨벤션, feature 패턴, 에러/인증/마이그레이션 규칙)와 겹치지 않는,
**운영중인 제품/데이터 설계 결정만** 남긴다. 코딩 규칙을 찾는 중이면 `AGENTS.md`로.

## 데이터 모델

핵심 흐름: `users → meetups → participants → verifications → point_logs`.
소모임 크롤링 데이터(`somoim_*`)는 앱 데이터와 분리된 읽기전용 테이블이다.

```text
users
- id, oauth_provider, nickname, avatar, total_points,
  active_badge_id(nullable FK badges.id, ON DELETE SET NULL),
  password_hash(nullable), password_updated_at,
  is_admin(legacy compatibility), admin_role(member/admin/owner), created_at
- total_points는 캐시. point_logs가 source of truth.
  불일치 시 point_logs로부터 재계산한다.
- active_badge_id는 헤더 아바타에 표시할 대표 뱃지. 뱃지 적용(apply) 시
  자동으로 갱신되고, /api/badges/:id/activate로 직접 바꿀 수 있다.
- 실제 owner 판정은 admin_role 문자열이나 nickname이 아니라 app_owner.user_id가 기준이다.
- password_hash와 password_updated_at이 모두 null이면 아직 한 번도 설정하지 않은 계정이다.
  모임 내부 사용자가 자신의 이름을 선택해 최초 비밀번호를 바로 만들 수 있다.
- password_hash는 null이지만 password_updated_at이 남아 있으면 관리자가 초기화한 계정이다.
  이 경우 관리자에게 받은 일회용 설정 코드가 있어야 새 비밀번호를 만들 수 있다.

app_owner                     -- 최고 관리자 UUID 잠금(항상 한 행)
- singleton(PK, true만 허용), user_id(UNIQUE FK users, RESTRICT), created_at
- owner 닉네임이 바뀌어도 권한은 유지된다.
- 애플리케이션에서 owner 임명·해제와 owner 비밀번호 초기화는 허용하지 않는다.

sessions                      -- 로그인 세션 (비밀번호 인증)
- token(PK, SHA-256 해시), user_id(FK users, CASCADE), created_at, expires_at
- 로그인 성공 시 원문 토큰을 HttpOnly/SameSite=Lax 쿠키로 한 번만 전달하고,
  DB에는 원문이 아닌 해시만 저장한다. 전역 미들웨어(resolveUser)는 쿠키 토큰을
  해시해 만료 전 세션만 인정한다. 프로덕션 bearer 인증은 기본 비활성화다.

password_setup_tokens         -- 관리자 초기화 후 사용하는 일회용 코드
- token_hash(PK), user_id(FK users, CASCADE), created_by(FK users, RESTRICT),
  expires_at, used_at(nullable), created_at
- 원문 코드는 응답으로 한 번만 관리자에게 전달하고 DB에는 SHA-256 해시만 저장한다.
- 새 코드를 발급하면 기존 코드와 대상의 모든 세션을 삭제하고 password_hash를 null로 만든다.
- 코드는 24시간 안에 한 번만 사용할 수 있으며 비밀번호 저장과 같은 트랜잭션에서 소비한다.
- admin은 member만, owner는 admin/member만 코드를 발급할 수 있다.
- 한 번도 비밀번호를 만들지 않은 계정에는 코드가 필요하지 않으며 최초 설정을 직접 허용한다.

admin_role_logs               -- 관리자 역할 변경 감사 이력
- id, target_user_id(FK users, CASCADE), changed_by(FK users, RESTRICT),
  previous_role, new_role, created_at
- 역할 변경과 로그 저장은 같은 트랜잭션으로 처리한다.

notices                       -- 관리자 공지
- id, title(1~100자), body(1~5000자), is_pinned, created_by(FK users, RESTRICT),
  published_at, created_at, updated_at
- admin과 owner가 작성·수정·삭제할 수 있다.

notice_reads                  -- 사용자별 공지 읽음 상태
- notice_id(FK notices, CASCADE), user_id(FK users, CASCADE), read_at
- PK(notice_id, user_id). 공지 삭제 시 읽음 기록도 함께 삭제된다.
- 종 알림은 최근 8개 요약과 별도 unread-count만 1분마다 조회한다.

meetups                       -- 앱 안에서 직접 만든 모임
- id, host_id, title, description, location, cafe_name(legacy, nullable),
  scheduled_at, capacity, status(open/closed), source_type(app/somoim),
  source_ref(nullable), somoim_state(none/pending/registered/failed),
  somoim_job_id(nullable), created_at
- `status`는 DB 운영 상태, API의 `lifecycleState`는 scheduled_at으로 계산한 upcoming/done 상태다.
- source_type='somoim'인 행은 정산 화면에서 소모임 일정을 정산 대상으로 쓰기 위해
  materialize한 앱 모임이다. source_ref는 somoim_events.id 문자열이며 unique다.
  정산 목록 조회 직전에 매핑된 소모임 참석자(face_id -> somoim_members -> users)가 있는
  일정만 upsert하고 participants에 반영한다.
- somoim_state는 앱 모임을 소모임 앱에 등록했는지다. source_type='somoim'과
  혼동하지 않는다 — 그쪽은 "소모임에서 가져온 모임", 이쪽은 "앱 모임을 올렸는가"다.
- pending과 failed인 모임에는 참가할 수 없다. failed는 개설자에게만 보인다.
- 상태 전이는 meetups가 직접 쓰지 않고 훅으로 받는다. somoim_job_id로 자기 행만
  갱신하며 AND somoim_state='pending' 조건이 있어, 재시도로 새 job에 넘어간 뒤
  늦게 도착한 보고는 무시된다.
    meetupCreated                모임 생성 → job이 생기면 pending, 거부되면 failed
    meetupSomoimRetryRequested   POST /api/meetups/:id/retry-somoim → pending
    somoimRegistrationSucceeded  /jobs/:id/complete → registered
    somoimRegistrationFailed     /jobs/:id/fail, /jobs/claim(재시도 소진) → failed
    meetupCancelled              DELETE /api/meetups/:id → 큐에 남은 job 중단
- 재시도는 개설자만, failed 모임만 할 수 있다. meetupCreated를 재사용하지 않는 것은
  그 리스너가 SOMOIM_AUTOMATION_AUTO_REGISTER로 게이트돼 있어, 자동 등록을 끄면
  재시도까지 함께 막히기 때문이다.
- submit_attempted_at이 찍힌 job은 실패를 알리지 않아 somoim_state가 pending에
  남는다(SOMOIM_AUTOMATION.md "Submit attempt").
- 이미 claim된 job은 취소해도 멈출 수 없다. 정모가 생성되므로 손으로 지운다.
  알려진 제약이다.

participants                  -- meetup 참가 (UNIQUE meetup_id+user_id)
- id, meetup_id, user_id, joined_at

settlement_payment_methods    -- 사용자별 재사용 정산 수단
- user_id(PK/FK users CASCADE), bank_name, bank_account_number,
  account_holder_name, kakaopay_link, updated_at
- 은행 계좌는 은행명·계좌번호·예금주를 모두 입력하거나 모두 비워야 한다.
  카카오페이 링크는 단독으로 둘 수 있다.
- 실제 송금 API 연동은 없다. 앱은 라운드 생성자의 정산 수단을 표시만 하고,
  송금은 앱 밖에서 수동으로 이루어진다.

meetup_settlements            -- 모임별 정산 라운드
- id, meetup_id(FK meetups CASCADE), round_no, total_amount, created_by(FK users),
  payer_bank_name, payer_bank_account_number, payer_account_holder_name,
  payer_kakaopay_link, created_at
- round_no는 모임 안에서 1부터 증가하며 UNIQUE(meetup_id, round_no)다.
- payer_* 컬럼은 라운드 생성 시점의 생성자 정산 수단 스냅샷이다.
  이후 사용자가 `settlement_payment_methods`를 수정해도 이미 만든 라운드는 바뀌지 않는다.

meetup_settlement_participants -- 정산 라운드 참여자별 금액과 송금 자가 신고
- settlement_id(FK meetup_settlements CASCADE), user_id(FK users),
  amount_due, paid_at(nullable)
- PK(settlement_id, user_id). amount_due는 해당 참여자가 내야 할 금액이다.
  균등 분담뿐 아니라 사람마다 다른 금액을 저장할 수 있으며, 새 정산 생성 시
  참여자별 amount_due 합계는 meetup_settlements.total_amount와 같아야 한다.
- 정산 라운드 수정은 생성자 또는 관리자가 할 수 있다. 기존 참여자가 계속 포함되면
  paid_at은 유지하고 amount_due만 갱신한다. 참여자에서 빠진 사람의 paid_at 기록은 함께 삭제된다.
- paid_at이 null이면 미완료, 값이 있으면 사용자가
  직접 "송금 완료"로 표시한 상태다. 받는 사람 확인 단계는 없다.
- 송금 완료 표시/취소는 본인 행만 바꾼다. 관리자 override는 없다.
  "내가 실제로 송금했다"는 본인만 주장할 수 있는 사실로 취급한다.

verification_uploads          -- 사진 인증 업로드 ticket
- id, meetup_id(FK), user_id(FK), object_key(UNIQUE), content_type,
  content_length, status(pending/finalizing/consumed/failed), failure_reason,
  expires_at, consumed_at, created_at
- presigned PUT 발급 시 생성한다. 사용자·모임 소유권, 허용 MIME, 크기, 만료,
  pending/시간당 발급 제한을 서버에서 검증한다.
- finalize 시 실제 객체의 크기·MIME·이미지 시그니처를 확인한 뒤 신뢰 경로로 이동한다.
  ticket은 한 번만 소비되며 실패·만료 staging 객체는 GC가 정리한다.

verifications                 -- 사진 인증 (UNIQUE meetup_id+user_id, 1인 1회)
- id, meetup_id, user_id, photo_url, points_awarded,
  status(approved/rejected/pending), created_at
- 클라이언트가 제출한 photo_url을 신뢰하지 않는다. 검증 완료된 upload ticket의
  object만 신뢰 경로로 옮긴 뒤 인증 행과 포인트를 기록한다.

point_logs                    -- 포인트 원장. source: verify/host/dice
- id, user_id, source, ref_id, amount, created_at

badge_generations             -- AI 뱃지 생성 이력
- id, user_id, prompt, provider, model, image_object_key, point_cost,
  status(processing/preview/applied/failed), error_message, created_at
- 외부 모델 호출 전에 generation 행으로 quota를 예약한다. 기본 사용자당 24시간 3회,
  동시 processing 1건이며 timeout·응답 크기 제한을 적용한다.
- 실패 generation과 미사용 preview 이미지는 badges.gc.js가 정리한다.

badges                        -- 생성 결과에서 확정된 뱃지
- id, title, description, image_object_key, provider, model, prompt,
  created_by, created_at

user_badges                   -- 유저가 보유한 뱃지 (PK user_id+badge_id)
- user_id, badge_id, awarded_at
- 인당 최대 5개 (badges.service.js MAX_BADGES_PER_USER가 검증 —
  DB 제약이 아니라 apply 트랜잭션의 user row 잠금 + 카운트로 보장)
- 삭제는 user_badges 행만 지운다. badges 행과 이미지 오브젝트는 즉시 지우지 않는다.
  미참조 badges와 이미지는 badges.gc.js가 배포 직후 한 번, 이후 설정된 스케줄에 따라
  최대 100개씩 반복 정리한다.

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

somoim_members                -- 크롤링된 멤버. id가 users.id와 동일(FK 역할)
- id, name, bio, face_id(얼굴 이미지 UUID), avatar_url, source_url,
  created_at, updated_at

somoim_events                 -- 크롤링된 정모 일정
- id, source_url, title, scheduled_at(nullable — 파싱 실패 가능),
  location, cost, joined_count, capacity, thumbnail_url

somoim_event_attendees        -- 정모 참석자 (face_id로 매핑, 이름 미매핑 시 null 허용)
- id, event_id, face_id, member_name, attendee_order, is_host, created_at
- attendee_order는 크롤링한 카드의 얼굴 표시 순서. is_host는 현재 소모임 UI에서
  첫 얼굴이 주최자로 보이는 관찰에 기반한 추정값(첫 참석자=true).

somoim_sync_logs              -- 크롤링 동기화 이력(성공/실패, 인원 수 비교용)
- id, source_url, expected_count, crawled_count, upserted_count,
  status, error_message, synced_at

somoim_automation_jobs        -- 소모임 앱 자동화 요청 큐 (worker가 소비)
- id, requested_by(FK users, SET NULL), type(현재 'create_meetup'만), payload(jsonb),
  status(pending/claimed/succeeded/failed/needs_manual_review), attempts,
  claimed_at, completed_at, error_message, result(jsonb), submit_attempted_at,
  created_at, updated_at
- submit_attempted_at은 되돌릴 수 없는 제출 직전에 찍는 표시다. 이 job은 자동
  재시도하지 않는다 — 중복 정모를 막는 장치이며 규칙은 SOMOIM_AUTOMATION.md의
  "Submit attempt"가 갖는다.
- claim은 FOR UPDATE SKIP LOCKED로 가장 오래된 pending 한 건만 가져간다.
  complete/fail은 status='claimed' 조건부 UPDATE라 이미 끝난 job은 다시 바뀌지 않는다.
- worker가 결과를 보고하지 못하고 죽으면 job이 claimed로 남는다. 다음 claim 요청
  직전에 stale(기본 900초) claim을 회수하며, attempts를 다 쓴 job(기본 3회)은
  needs_manual_review로 넘긴다. 별도 스케줄러 없이 worker 폴링 시점에만 돈다.
  needs_manual_review로 넘어간 job은 `/jobs/claim` 라우트가 `somoimRegistrationFailed`를
  emit해 연결된 meetups 행도 failed로 옮긴다(위 meetups 섹션 참고).
- 완료·실패가 보고된 job은 재실행하지 않는다. worker가 판단을 내렸다면 뒤집지 않는다.
- payload의 dryRun/submit 조합은 서버와 worker가 각각 검증한다. 실제 제출은
  SOMOIM_AUTOMATION_ALLOW_SUBMIT(서버)과 ALLOW_SOMOIM_SUBMIT(worker)이 모두 true일 때만
  가능하다. 계약은 SOMOIM_AUTOMATION.md가 source of truth다.

cafe_comments                 -- 카페별 한줄 코멘트 (방문 이력 있는 유저만 작성 가능)
- id, cafe_location, user_id, body(1~120자), created_at, updated_at
  (UNIQUE cafe_location+user_id — 유저당 카페 하나에 코멘트 하나, upsert)

app_flags                     -- 앱 전역 토글 (현재 key: 'smashed' — 깨부수기 장난 모드)
- key(PK), value(boolean), updated_by(nullable FK — 의도적으로 채우지 않음,
  누가 깨부쉈는지 익명 보장), updated_at
- 전역 상태라 모든 사용자에게 공유됨. 클라이언트는 45초 폴링으로 동기화.

game2048_scores               -- 2048 미니게임 최고점수 (유저당 한 행)
- user_id(PK, FK users CASCADE), best_score, updated_at,
  saved_state(jsonb, nullable), saved_at
- 누적이 아니라 upsert(GREATEST)로 최고점수만 유지. 게임오버 시 제출되고,
  기존보다 높을 때만 갱신. 랭킹은 best_score DESC.
- saved_state는 "이어서 하기"용 진행 중 게임(보드+점수). 매 이동이 아니라
  페이지 이탈 시에만 저장(서버 부하 최소화), 게임오버 시 NULL로 비움.
  서버가 구조를 검증해 저장(변조/오염 방어).

cafe_places                   -- 카페 위치 문자열 → 좌표 지오코딩 캐시 (네이버 장소 검색)
- location(PK, cafe_location과 같은 문자열 키), place_name, road_address,
  lat, lng(둘 다 null이면 검색 실패 기록), resolved_at
- 카페 목록 조회 시 미해석 위치를 요청당 최대 5개씩 lazy 지오코딩.
  실패 기록은 7일 뒤 재시도. 검색 API 미설정 시에는 기록하지 않음.
```

전체 스키마와 변경 이력은 `migrations/`가 정답이다. 위 요약이 실제 파일과
어긋나면 마이그레이션 쪽이 맞다 — 이 문서를 고친다.

## 알려진 설계 한계

- `cafe_comments.cafe_location`은 문자열 키라 같은 카페도 표기 차이로 분리될 수 있다.
  지도 좌표는 보정되지만 집계·코멘트는 문자열 기준이다.
- 개발 환경에서는 토큰 없이 `x-user-id` 인증 폴백이 동작한다.
  프로덕션 권한은 HttpOnly 세션 쿠키로 검증한다.
- 로컬 전용 DB가 없어 `DATABASE_URL`이 공유 Railway DB를 가리킬 수 있다.
  로컬에서 `npm run db:migrate`를 실행하지 않는다.
- owner 초기 지정에는 부트스트랩 제약이 있다.
  변경 전 `app_owner`, `users.admin_role`, 비밀번호 상태를 함께 확인한다.

## 포인트 규칙

사진 인증은 10점, 주사위는 나온 값(1~6점), 모임 개설은 0점이다.
새 포인트 출처를 추가하면 `point_logs.source` DB CHECK도 함께 변경한다.

## 트랜잭션 요구사항

사진 인증은 검증된 upload ticket을 원자적으로 소비해야 한다. 아래 쓰기는 하나의
트랜잭션이어야 한다.

1. `verification_uploads`를 consumed로 전환
2. `verifications` insert
3. `point_logs` insert
4. `users.total_points` increment

네 개를 독립된 쿼리로 나눠 쓰지 않는다(`db.transaction()` 사용).

모임 참여는 meetup 행을 `FOR UPDATE`로 잠근 같은 트랜잭션에서 기존 참여와 정원을 확인한 뒤 insert한다.

정산 라운드 생성은 meetup 행을 잠근 같은 트랜잭션에서 참여자 검증, 다음 round_no 계산,
생성자의 정산 수단 조회, `meetup_settlements` 스냅샷 insert,
`meetup_settlement_participants` insert를 처리한다. 스냅샷 조회와 라운드 insert를
분리하지 않는다.

관리자/인증 기능도 다음 묶음을 원자적으로 처리한다.

- 최초 비밀번호 설정은 `password_hash IS NULL AND password_updated_at IS NULL` 조건부
  UPDATE로 한 요청만 성공하게 한다.
- 관리자 역할 변경 + `admin_role_logs` 기록
- 비밀번호 설정 코드 발급 + 기존 코드 삭제 + 비밀번호 초기화 + 세션 삭제
- 설정 코드 소비 + 새 비밀번호 저장
