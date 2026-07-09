-- Preserve the order shown on Somoim event cards and mark the first attendee
-- as the inferred host. Existing rows keep a neutral order until the next sync.

ALTER TABLE somoim_event_attendees
  ADD COLUMN attendee_order integer,
  ADD COLUMN is_host boolean NOT NULL DEFAULT false;

CREATE INDEX somoim_event_attendees_host_idx
  ON somoim_event_attendees (event_id, is_host DESC, attendee_order NULLS LAST);
