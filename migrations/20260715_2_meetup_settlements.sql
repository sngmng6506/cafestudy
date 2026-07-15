CREATE TABLE meetup_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  round_no integer NOT NULL CHECK (round_no > 0),
  total_amount integer NOT NULL CHECK (total_amount > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meetup_id, round_no)
);

CREATE TABLE meetup_settlement_participants (
  settlement_id uuid NOT NULL REFERENCES meetup_settlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (settlement_id, user_id)
);

CREATE INDEX meetup_settlements_meetup_id_idx
  ON meetup_settlements (meetup_id, round_no);

CREATE INDEX meetup_settlement_participants_user_id_idx
  ON meetup_settlement_participants (user_id);
