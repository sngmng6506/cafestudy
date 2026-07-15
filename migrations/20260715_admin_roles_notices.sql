ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role text NOT NULL DEFAULT 'member';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_admin_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_admin_role_check
  CHECK (admin_role IN ('member', 'admin', 'owner'));

UPDATE users
SET admin_role = CASE WHEN is_admin THEN 'admin' ELSE 'member' END
WHERE admin_role = 'member';

UPDATE users
SET admin_role = 'owner', is_admin = true
WHERE nickname = '이상명';

CREATE TABLE IF NOT EXISTS admin_role_logs (
  id bigserial PRIMARY KEY,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_role text NOT NULL CHECK (previous_role IN ('member', 'admin', 'owner')),
  new_role text NOT NULL CHECK (new_role IN ('member', 'admin', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_role_logs_target_idx
  ON admin_role_logs (target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notices (
  id bigserial PRIMARY KEY,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notices_order_idx
  ON notices (is_pinned DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id bigint NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_id)
);

CREATE INDEX IF NOT EXISTS notice_reads_user_idx
  ON notice_reads (user_id, read_at DESC);
