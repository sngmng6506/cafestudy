-- 정모(모임 일정) 크롤링 지원.
-- 1) somoim_members 에 face_id 추가: 정모 참가자 얼굴 이미지 UUID <-> 멤버 매핑 키.
-- 2) somoim_events: 크롤링한 정모 일정 (읽기전용 참고 데이터, 앱 meetups 와 분리).
-- 3) somoim_event_attendees: 정모 <-> 참가자 매핑. 이름 미매핑(null) 허용.

ALTER TABLE somoim_members ADD COLUMN face_id text;
CREATE INDEX somoim_members_face_id_idx ON somoim_members (face_id);

CREATE TABLE somoim_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url    text        NOT NULL,
  title         text        NOT NULL,
  scheduled_at  timestamptz,
  location      text,
  cost          text,
  joined_count  integer,
  capacity      integer,
  thumbnail_url text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- 같은 모임 페이지에서 같은 시각의 정모는 하나로 취급 (재크롤링 시 UPSERT).
  -- scheduled_at 이 null 인 경우(날짜 파싱 실패)는 title 로 구분.
  CONSTRAINT somoim_events_unique UNIQUE (source_url, title, scheduled_at)
);

CREATE INDEX somoim_events_scheduled_at_idx ON somoim_events (scheduled_at);

CREATE TABLE somoim_event_attendees (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES somoim_events(id) ON DELETE CASCADE,
  face_id      text        NOT NULL,
  member_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT somoim_event_attendees_unique UNIQUE (event_id, face_id)
);

CREATE INDEX somoim_event_attendees_event_idx ON somoim_event_attendees (event_id);
CREATE INDEX somoim_event_attendees_face_idx ON somoim_event_attendees (face_id);
