-- 모임이 열리는 장소의 카카오 장소 ID와 상세페이지 URL.
--
-- 지금까지 장소는 사람이 읽는 문자열 하나뿐이었다. 그래서 소모임 앱에 넣는 지도
-- 링크를 이름으로 만든 "검색" URL로 만들 수밖에 없었고(진짜 장소 페이지에는 장소
-- ID가 필요하다), 같은 카페인지 판단할 안정적인 키도 없었다.
--
-- 값은 모임을 만들 때 사용자가 검색 결과에서 고른 장소에서 온다. 직접 입력하거나
-- 예전에 만들어진 모임은 null이다 — 그때는 예전처럼 문자열로만 다룬다.
ALTER TABLE meetups
  ADD COLUMN place_id text,
  ADD COLUMN place_url text;

CREATE INDEX meetups_place_id_idx ON meetups (place_id) WHERE place_id IS NOT NULL;
