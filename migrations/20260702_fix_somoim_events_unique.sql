-- somoim_events 유니크 제약 수정.
-- 기존 UNIQUE (source_url, title, scheduled_at)은 Postgres가 NULL을 서로 다른 값으로
-- 취급하기 때문에, scheduled_at이 NULL인 정모(날짜 파싱 실패)는 ON CONFLICT가
-- 매칭되지 않아 크롤링마다 중복 행이 쌓인다.
-- COALESCE 표현식 유니크 인덱스로 교체해 NULL도 단일 행으로 유지한다.

-- 1) 기존 중복 정리 (가장 최근 updated_at 행만 남김).
-- 같은 트랜잭션에서 삽입된 중복은 updated_at이 동일하므로 id로 타이브레이크.
DELETE FROM somoim_events e
USING somoim_events dup
WHERE e.source_url = dup.source_url
  AND e.title = dup.title
  AND e.scheduled_at IS NOT DISTINCT FROM dup.scheduled_at
  AND (e.updated_at, e.id) < (dup.updated_at, dup.id);

-- 2) 제약 교체.
ALTER TABLE somoim_events DROP CONSTRAINT somoim_events_unique;

CREATE UNIQUE INDEX somoim_events_unique_idx
  ON somoim_events (source_url, title, COALESCE(scheduled_at, 'epoch'::timestamptz));
