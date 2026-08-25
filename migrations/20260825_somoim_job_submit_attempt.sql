-- 정모 생성은 되돌릴 수 없는 외부 동작이다. worker가 제출 버튼을 누른 뒤 결과를
-- 보고하지 못하면(네트워크 순단, 프로세스 종료) job은 claimed로 남고, stale 회수가
-- pending으로 되돌려 처음부터 다시 실행한다 — 소모임에 정모가 하나 더 생긴다.
--
-- worker는 제출 직전에 이 컬럼을 찍는다. 값이 있으면 "이 job은 이미 외부에 영향을
-- 줬을 수 있다"는 뜻이므로 절대 자동 재시도하지 않고 사람에게 넘긴다.
ALTER TABLE somoim_automation_jobs ADD COLUMN submit_attempted_at timestamptz;
