-- cafe_name is being phased out in favour of map-based location selection.
-- Keep the column (so already-deployed code keeps working) but make it optional,
-- and add a free-text description of what the host plans to do.
ALTER TABLE meetups ALTER COLUMN cafe_name DROP NOT NULL;
ALTER TABLE meetups ADD COLUMN description text;
