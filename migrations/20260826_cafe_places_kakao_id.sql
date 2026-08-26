-- 카페 이력을 합치는 기준을 문자열에서 장소 ID로 옮긴다.
--
-- 지금은 방문 이력을 location 문자열로 묶는데, 같은 카페가 출처마다 다르게 적혀
-- 갈라진다. 실제로 앱 모임의 "아비아채 서울홍대점 (서울특별시 마포구 와우산로37길 52
-- ...)"과 크롤링 정모의 "아비아채 지하1층"이 같은 좌표를 가리키면서 따로 세어졌다.
--
-- 카카오 로컬 검색이 장소 ID와 상세페이지 URL을 함께 주므로 그것을 캐시에 담는다.
-- 카카오가 못 찾는 자유 입력("정기모임장소 근처" 등)은 id가 null로 남고, 그런 항목은
-- 합치지 않고 원본 문자열 그대로 둔다 — 확신 없는 지오코딩으로 남의 카페에 묶는 것보다
-- 갈라진 채 두는 편이 낫다.
ALTER TABLE cafe_places
  ADD COLUMN kakao_place_id text,
  ADD COLUMN place_url text;

-- 같은 장소 ID를 가진 행을 빠르게 모으기 위한 인덱스. id가 없는 행은 합치지 않으므로
-- 부분 인덱스로 둔다.
CREATE INDEX cafe_places_kakao_place_id_idx
  ON cafe_places (kakao_place_id)
  WHERE kakao_place_id IS NOT NULL;

-- 기존 행의 좌표는 네이버 지오코딩 결과다. 카카오 ID와 섞이지 않도록 그대로 두고,
-- 다음 조회 때 다시 풀리도록 resolved_at을 과거로 돌린다(서비스가 오래된 항목을
-- 재시도한다). 데이터를 지우지는 않는다 — 재시도가 실패해도 지도는 계속 그려야 한다.
UPDATE cafe_places SET resolved_at = now() - interval '30 days';
