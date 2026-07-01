CREATE TABLE cafe_comments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_location text        NOT NULL,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cafe_comments_location_user_unique UNIQUE (cafe_location, user_id),
  CONSTRAINT cafe_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 120)
);

CREATE INDEX cafe_comments_location_idx ON cafe_comments (cafe_location);

