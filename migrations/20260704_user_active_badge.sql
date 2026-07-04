ALTER TABLE users
ADD COLUMN active_badge_id uuid REFERENCES badges(id) ON DELETE SET NULL;
