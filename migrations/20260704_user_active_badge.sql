-- 주의: badges 테이블을 참조하므로 20260704_create_badges.sql 이후에 실행되어야
-- 한다. 파일명 사전순('c' < 'u')으로 순서가 보장되지만, 같은 날짜의 마이그레이션을
-- 추가한다면 이 두 파일 사이에 끼지 않는 이름인지 확인할 것 (AGENTS.md 참고).
ALTER TABLE users
ADD COLUMN active_badge_id uuid REFERENCES badges(id) ON DELETE SET NULL;
