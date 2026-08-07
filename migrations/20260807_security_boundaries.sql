-- 기존 세션에는 원문 bearer token이 저장돼 있으므로 새 hash-only 세션과 섞지 않는다.
DELETE FROM sessions;

CREATE TABLE verification_uploads (
  id uuid PRIMARY KEY,
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  content_length integer NOT NULL CHECK (content_length > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'finalizing', 'consumed', 'failed')),
  failure_reason text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_uploads_user_created_idx
  ON verification_uploads (user_id, created_at DESC);
CREATE INDEX verification_uploads_cleanup_idx
  ON verification_uploads (status, expires_at)
  WHERE status <> 'consumed';
CREATE INDEX badge_generations_user_created_idx
  ON badge_generations (user_id, created_at DESC);
