-- 2048 미니게임 최고점수. 유저당 한 행(최고점수만 유지).
-- 누적이 아니라 "기존보다 높으면 갱신"하는 upsert 방식이라 point_logs와 분리.
CREATE TABLE game2048_scores (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best_score integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 랭킹 조회(best_score DESC)를 위한 인덱스.
CREATE INDEX game2048_scores_best_idx ON game2048_scores (best_score DESC);
