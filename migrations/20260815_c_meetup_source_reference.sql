ALTER TABLE meetups
  ADD COLUMN source_type text NOT NULL DEFAULT 'app',
  ADD COLUMN source_ref text,
  ADD CONSTRAINT meetups_source_type_check CHECK (source_type IN ('app', 'somoim')),
  ADD CONSTRAINT meetups_source_ref_required_check CHECK (
    (source_type = 'app' AND source_ref IS NULL)
    OR (source_type <> 'app' AND source_ref IS NOT NULL)
  );

CREATE UNIQUE INDEX meetups_source_unique_idx
  ON meetups (source_type, source_ref)
  WHERE source_ref IS NOT NULL;
