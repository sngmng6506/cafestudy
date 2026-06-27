CREATE TABLE somoim_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  bio         text,
  source_url  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT somoim_members_name_source_unique UNIQUE (name, source_url)
);

CREATE TABLE somoim_sync_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url      text        NOT NULL,
  expected_count  integer,
  crawled_count   integer,
  upserted_count  integer,
  status          text        NOT NULL DEFAULT 'success',
  error_message   text,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
