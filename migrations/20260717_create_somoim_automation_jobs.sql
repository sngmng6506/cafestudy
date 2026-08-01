CREATE TABLE somoim_automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  completed_at timestamptz,
  error_message text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT somoim_automation_jobs_type_check
    CHECK (type IN ('create_meetup')),
  CONSTRAINT somoim_automation_jobs_status_check
    CHECK (status IN ('pending', 'claimed', 'succeeded', 'failed', 'needs_manual_review'))
);

CREATE INDEX somoim_automation_jobs_status_created_at_idx
  ON somoim_automation_jobs (status, created_at);

CREATE INDEX somoim_automation_jobs_requested_by_created_at_idx
  ON somoim_automation_jobs (requested_by, created_at DESC);
