ALTER TABLE meetup_settlement_participants
  ADD COLUMN amount_due integer;

WITH participant_counts AS (
  SELECT settlement_id, COUNT(*)::integer AS participant_count
  FROM meetup_settlement_participants
  GROUP BY settlement_id
)
UPDATE meetup_settlement_participants sp
   SET amount_due = FLOOR(s.total_amount::numeric / pc.participant_count)::integer
  FROM meetup_settlements s
  JOIN participant_counts pc ON pc.settlement_id = s.id
 WHERE sp.settlement_id = s.id;

ALTER TABLE meetup_settlement_participants
  ALTER COLUMN amount_due SET NOT NULL,
  ADD CONSTRAINT meetup_settlement_participants_amount_due_check CHECK (amount_due >= 0);
