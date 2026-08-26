-- 정모 삭제 job type을 허용한다. 웹 모임이 취소됐는데 소모임에는 정모가 이미
-- 만들어진 경우, 지금은 사람이 앱에서 손으로 지워야 한다.
ALTER TABLE somoim_automation_jobs DROP CONSTRAINT somoim_automation_jobs_type_check;

ALTER TABLE somoim_automation_jobs ADD CONSTRAINT somoim_automation_jobs_type_check
  CHECK (type IN ('create_meetup', 'delete_meetup'));
