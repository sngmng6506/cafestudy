-- 신규/복구 DB 부트스트랩 가드.
--
-- 문제: 다음에 실행되는 20260715_secure_admin_auth.sql이 두 가지를 RAISE EXCEPTION으로
-- 강제한다. (1) owner가 정확히 1명, (2) 그 owner가 password_hash를 가질 것.
-- 그런데 owner는 앞의 20260715_admin_roles_notices.sql이 `WHERE nickname = '이상명'`으로
-- 정한다. 빈 DB에는 크롤링 전이라 그런 유저가 없어(시드된 건 'Demo User'뿐) owner가 0명
-- → 예외 → scripts/migrate.js가 exit(1) → Dockerfile의 `db:migrate && npm start`가 멈춰
-- 컨테이너가 아예 뜨지 않는다. 즉 새 환경(스테이징·재해복구·신규 DB)을 만들 수 없다.
-- users.nickname에는 UNIQUE 제약이 없고 값이 크롤러에서 오므로, 동명이인이 있으면
-- owner가 2명이 되어 같은 예외로 막히기도 한다.
--
-- 기존 프로덕션은 이 두 마이그레이션이 이미 성공적으로 적용돼 있어 영향이 없다.
-- (owner 1명 + 비밀번호 보유 → 아래 로직 전부 no-op)
--
-- 적용된 마이그레이션 파일은 수정할 수 없으므로(AGENTS.md, migrate.js의 checksum 검증),
-- 가드를 없애는 대신 가드가 기대하는 상태를 미리 만들어 준다.
DO $$
DECLARE
  owner_count integer;
  bootstrap_id uuid;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM users WHERE admin_role = 'owner';

  -- owner가 없는 빈 DB: 가장 먼저 만들어진 유저(시드된 Demo User)를 임시 owner로 세운다.
  -- 실제 소유자는 크롤링 이후 app_owner.user_id를 바꿔 지정한다(아래 주석 참고).
  IF owner_count = 0 THEN
    SELECT id INTO bootstrap_id FROM users ORDER BY created_at, id LIMIT 1;

    -- 유저가 하나도 없으면 세울 owner도 없다. 이 경우 20260620_seed_demo_user.sql이
    -- 먼저 실행되므로 정상 경로에서는 도달하지 않는다.
    IF bootstrap_id IS NULL THEN
      RAISE EXCEPTION 'Cannot bootstrap owner: users table is empty';
    END IF;

    UPDATE users SET admin_role = 'owner', is_admin = true WHERE id = bootstrap_id;
  END IF;

  -- 동명이인 등으로 owner가 여러 명이면 가장 오래된 한 명만 남긴다.
  IF owner_count > 1 THEN
    UPDATE users
    SET admin_role = 'member', is_admin = false
    WHERE admin_role = 'owner'
      AND id <> (SELECT id FROM users WHERE admin_role = 'owner' ORDER BY created_at, id LIMIT 1);
  END IF;
END $$;

-- owner에게 비밀번호가 없으면 로그인 불가능한 자리표시자를 넣어 두 번째 가드를 통과시킨다.
-- verifyPassword는 'scrypt$<salt>$<hash>' 형식만 인정하므로(auth.util.js), scheme이 다른
-- 이 값으로는 어떤 비밀번호로도 로그인할 수 없다 — 부트스트랩 전용 잠긴 계정이다.
--
-- 복구 절차: 실제 소유자 계정이 생긴 뒤(크롤링 후)
--   UPDATE app_owner SET user_id = '<실제 UUID>';
--   UPDATE users SET admin_role='owner', is_admin=true WHERE id = '<실제 UUID>';
--   UPDATE users SET password_hash = NULL, password_updated_at = NULL WHERE id = '<실제 UUID>';
-- 로 소유권을 옮기고 최초 비밀번호 설정을 열어 준다.
UPDATE users
SET password_hash = 'locked$owner-bootstrap-placeholder'
WHERE admin_role = 'owner'
  AND password_hash IS NULL;
