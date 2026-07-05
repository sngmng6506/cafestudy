-- 앱 전역 토글 상태 (현재는 '깨부수기' 하나). key-value라 다른 전역
-- 플래그가 생겨도 재사용할 수 있다.
CREATE TABLE app_flags (
  key text PRIMARY KEY,
  value boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
