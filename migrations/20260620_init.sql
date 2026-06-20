CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth_provider text,
  nickname text NOT NULL,
  avatar text,
  total_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meetups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  cafe_name text NOT NULL,
  location text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetups_status_check CHECK (status IN ('open', 'closed'))
);

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT participants_meetup_user_unique UNIQUE (meetup_id, user_id)
);

CREATE TABLE verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  points_awarded integer NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verifications_meetup_user_unique UNIQUE (meetup_id, user_id),
  CONSTRAINT verifications_status_check CHECK (status IN ('approved', 'rejected', 'pending'))
);

CREATE TABLE point_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL,
  ref_id uuid NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_logs_source_check CHECK (source IN ('verify', 'host'))
);

CREATE INDEX meetups_status_scheduled_at_idx ON meetups (status, scheduled_at);
CREATE INDEX point_logs_user_created_at_idx ON point_logs (user_id, created_at);
CREATE INDEX point_logs_created_at_idx ON point_logs (created_at);
