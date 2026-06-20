ALTER TABLE meetups ADD COLUMN capacity integer NOT NULL DEFAULT 8;
ALTER TABLE meetups ADD CONSTRAINT meetups_capacity_check CHECK (capacity >= 1);
