DO $$
DECLARE
  owner_count integer;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM users WHERE admin_role = 'owner';
  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one owner before locking owner identity, found %', owner_count;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_owner (singleton, user_id)
SELECT true, id
FROM users
WHERE admin_role = 'owner'
ON CONFLICT (singleton) DO NOTHING;

UPDATE users
SET admin_role = 'member', is_admin = false
WHERE admin_role = 'owner'
  AND id <> (SELECT user_id FROM app_owner WHERE singleton = true);

UPDATE users
SET admin_role = 'owner', is_admin = true
WHERE id = (SELECT user_id FROM app_owner WHERE singleton = true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users u
    JOIN app_owner ao ON ao.user_id = u.id
    WHERE u.password_hash IS NULL
  ) THEN
    RAISE EXCEPTION 'Owner must have a password before secure reset migration';
  END IF;
END $$;

-- 과거 초기화로 password_updated_at만 남은 일반 계정은 한 번만 최초 설정 흐름을 허용한다.
UPDATE users
SET password_updated_at = NULL
WHERE password_hash IS NULL
  AND id <> (SELECT user_id FROM app_owner WHERE singleton = true);

CREATE TABLE IF NOT EXISTS password_setup_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_setup_tokens_user_idx
  ON password_setup_tokens (user_id, expires_at DESC)
  WHERE used_at IS NULL;
