// 자동화가 소모임에 올린 앱 모임은 다음 크롤링에 정모로 되돌아온다. 그러면 같은
// 모임이 앱 행(meetups)과 크롤링 행(somoim_events) 두 개로 존재하는데, 둘을 잇는
// id가 없다 — 자동화는 앱 화면을 조작할 뿐 소모임이 부여한 정모 id를 알 수 없다.
//
// 그래서 크롤러가 정모를 구분하는 키와 같은 (제목, 일시)로 짝짓는다. 삭제 job이
// 정모를 찾을 때 쓰는 키와도 같다(SOMOIM_AUTOMATION.md). 소모임에 실제로 올라간
// 모임만 대상이므로 somoim_state = 'registered'로 좁힌다.
//
// 이 SQL 조각을 쓰는 쪽은 somoim_events를 e로 별칭해야 한다.
export const NOT_FROM_APP_MEETUP = `
  NOT EXISTS (
    SELECT 1
    FROM meetups origin
    WHERE origin.somoim_state = 'registered'
      AND origin.source_type = 'app'
      -- 공백을 접어서 비교한다. 앱 모임 제목은 입력 그대로 저장되지만, 등록 job은
      -- normalizeText로 연속 공백을 하나로 줄이고 앞뒤를 잘라 앱에 입력한다. 크롤러가
      -- 읽어오는 건 그 줄어든 제목이라, "카페  스터디"(공백 둘)처럼 저장된 모임은
      -- 그대로 비교하면 짝을 못 찾고 중복이 되살아난다.
      AND regexp_replace(btrim(origin.title), '\\s+', ' ', 'g')
        = regexp_replace(btrim(e.title), '\\s+', ' ', 'g')
      -- 분 단위로 자른다. 크롤러는 화면에 찍힌 "8월 29일 (금) 오후 2:00"을 파싱하고
      -- 앱 모임은 초까지 들고 있어, 정확 비교로는 14:00:00과 14:00:30이 다른 모임이
      -- 된다. 그러면 짝을 못 찾고 중복이 조용히 되살아난다.
      AND date_trunc('minute', origin.scheduled_at) = date_trunc('minute', e.scheduled_at)
  )
`;
