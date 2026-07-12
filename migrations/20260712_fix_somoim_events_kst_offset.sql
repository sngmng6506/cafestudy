-- 크롤러 타임존 버그로 잘못 저장된 정모 시각 보정.
-- 크롤러가 KST 벽시계 시각을 서버 로컬(UTC 컨테이너) 시각으로 해석해 저장했기 때문에,
-- 기존 scheduled_at은 실제보다 9시간 늦은 인스턴트다. 파서 수정(멤버 feature,
-- members.events.js의 KST 고정 오프셋)과 함께 기존 행을 -9h 보정한다.
-- 보정하지 않으면 scheduled_at이 유니크 키(source_url, title, scheduled_at)의 일부라서
-- 수정 배포 후 첫 크롤링 때 같은 정모가 중복 행으로 삽입된다.
-- 모든 기존 행은 UTC 서버(Railway)에서 크롤링되었음을 확인함 (2026-07-12).

UPDATE somoim_events
SET scheduled_at = scheduled_at - interval '9 hours'
WHERE scheduled_at IS NOT NULL;
