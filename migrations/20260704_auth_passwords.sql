-- 비밀번호 인증: users에 비밀번호/관리자 컬럼 추가 + 세션 테이블 신설.
-- users.id === somoim_members.id (백필됨) 이므로 인증 정보는 users에 둔다.

ALTER TABLE users
  ADD COLUMN password_hash text,
  ADD COLUMN password_updated_at timestamptz,
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- 관리자 지정 (이름 기준). 대상이 아직 users에 없으면 이후 동기화 시 false로 남으므로
-- 실제 운영에선 대상 계정 존재를 확인한다.
UPDATE users SET is_admin = true WHERE nickname IN ('문한결', '이상명');

CREATE TABLE sessions (
  token       text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
