-- 지오코딩 후보 검색(괄호 제거·꼬리 단어 축소)과 한 글자 위치 제외가 도입되어,
-- 기존 실패 기록과 한 글자 위치의 엉뚱한 결과를 비워 새 로직으로 다시 해석되게 한다.
-- cafe_places는 캐시라서 지워도 데이터 손실이 없다.
DELETE FROM cafe_places
WHERE lat IS NULL
   OR length(trim(location)) < 2;
