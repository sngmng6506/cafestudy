-- 취소 훅과 "취소 뒤 생성 완료" 보상 훅이 동시에 같은 정모를 정리해도
-- 실행 중인 삭제 job은 하나만 남긴다. payload는 서비스에서 정규화된 ISO 문자열이다.
CREATE UNIQUE INDEX IF NOT EXISTS somoim_active_delete_job_unique
  ON somoim_automation_jobs (
    (payload->>'title'),
    (payload->>'scheduledAt')
  )
  WHERE type = 'delete_meetup' AND status IN ('pending', 'claimed');
