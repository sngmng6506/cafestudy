-- 앱에서 만든 모임이 소모임 앱에도 등록됐는지 추적한다.
-- source_type/source_ref는 "소모임에서 가져온 모임"을 뜻하므로 의미가 다르다.
ALTER TABLE meetups ADD COLUMN somoim_state text NOT NULL DEFAULT 'none';

ALTER TABLE meetups ADD CONSTRAINT meetups_somoim_state_check
  CHECK (somoim_state IN ('none', 'pending', 'registered', 'failed'));

ALTER TABLE meetups ADD COLUMN somoim_job_id uuid
  REFERENCES somoim_automation_jobs(id) ON DELETE SET NULL;

CREATE INDEX meetups_somoim_state_idx ON meetups (somoim_state)
  WHERE somoim_state <> 'none';
