-- 카페 코멘트 익명 옵션. true면 다른 사람에게 작성자 이름이 '익명'으로 표시된다.
-- (본인에게는 여전히 자기 코멘트로 보이고 수정할 수 있다)
ALTER TABLE cafe_comments
  ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
