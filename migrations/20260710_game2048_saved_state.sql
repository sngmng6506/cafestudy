-- 2048 "이어서 하기": 진행 중인 게임 상태를 유저당 하나 저장.
-- 매 이동이 아니라 페이지를 벗어날 때만 저장(서버 부하 최소화).
-- 게임오버되거나 저장할 게 없으면 NULL로 비운다.
-- 보드/점수 구조가 바뀔 수 있어 개별 컬럼 대신 jsonb 한 덩어리로 저장.
ALTER TABLE game2048_scores
  ADD COLUMN saved_state jsonb,
  ADD COLUMN saved_at timestamptz;
