CREATE TABLE badge_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  image_object_key text NOT NULL,
  point_cost integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'preview',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_object_key text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_badges (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
