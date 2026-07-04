-- 카페 위치 문자열 → 좌표 지오코딩 캐시. 다른 테이블에 의존하지 않는
-- 독립 마이그레이션이라 같은 날짜의 다른 파일들과 실행 순서가 무관하다.
CREATE TABLE cafe_places (
  location text PRIMARY KEY,
  place_name text,
  road_address text,
  lat double precision,
  lng double precision,
  resolved_at timestamptz NOT NULL DEFAULT now()
);
