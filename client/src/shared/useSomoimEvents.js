// 소모임(크롤링) 정모 이벤트를 프론트에서 다루는 공통 로직.
// HomePage / HistoryPage에 거의 동일하게 복붙돼 있던 변환 함수를 통합.
// 정모 데이터 형태가 바뀌면 여기 한 곳만 고치면 된다.

// 정모 참석자 목록 정규화 → [{ name, badgeUrl }].
// attendees는 이름 매핑된 참석자만 옴(백엔드에서 null 이름 제외). 참여 인원과
// 차이나면 "외 N명" 항목으로 보정 — 매핑 안 된 참석자 수를 감추지 않기 위함.
export function somoimAttendees(event) {
  const participantCount = Number(event.joinedCount ?? 0);
  const named = (event.attendees ?? [])
    .filter((a) => a.name)
    .map((a) => ({ name: a.name, badgeUrl: a.badgeUrl ?? null, isHost: a.isHost === true }));
  const unmapped = participantCount - named.length;
  return unmapped > 0
    ? [...named, { name: `외 ${unmapped}명`, unmappedCount: unmapped }]
    : named;
}

// 정모 → 공통 meetup 형태(코어 필드). 화면별 추가 필드는 호출부에서 확장.
export function somoimEventToMeetup(event) {
  const scheduledAt = event.scheduledAt;
  return {
    id: `somoim-${event.id}`,
    title: event.title,
    description: event.cost ? `참가비 ${event.cost}` : '',
    location: event.location ?? '장소 미정',
    scheduledAt,
    capacity: Number(event.capacity ?? event.joinedCount ?? 0),
    participantCount: Number(event.joinedCount ?? 0),
    attendees: somoimAttendees(event),
    readonly: true,
    state: new Date(scheduledAt) < new Date() ? 'done' : 'upcoming',
  };
}

// 소모임 참여 링크: 참석은 소모임 앱에서만 가능하므로 플랫폼별로 앱 실행을 시도.
// 공개 딥링크가 없어(스킴·App Links 미제공) 특정 정모로는 못 가고 앱 실행까지만 지원.
export function somoimAppLink(userAgent = navigator.userAgent) {
  if (/android/i.test(userAgent)) {
    // 앱 실행, 미설치면 Play 스토어 폴백. intent: 링크는 새 탭에서 동작 안 함 → _self.
    return {
      href: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.friendscube.somoim;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.friendscube.somoim;end',
      target: '_self',
    };
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    // 스킴 미공개라 App Store로 → 설치돼 있으면 "열기" 버튼으로 앱 진입.
    return { href: 'https://apps.apple.com/kr/app/id582910479', target: '_blank' };
  }
  return { href: 'https://www.somoim.co.kr', target: '_blank' };
}

// 참석자 배열 → 아바타 스택 데이터. 항목은 { name, badgeUrl? } 객체
// (과거 형태인 이름 문자열도 허용). "외 N명" 항목(unmappedCount)은
// 집계용이므로 스택에서 제외하고 overflow 카운트로 환산.
// MeetupCard / HistoryPage 공통.
export function attendeeStack(attendees, max = 5) {
  const normalized = (attendees ?? []).map((a) =>
    typeof a === 'string' ? { name: a, badgeUrl: null } : a,
  );
  const people = normalized.filter((a) => !a.unmappedCount && !/^외 \d+명$/.test(a.name));
  const extraItem = normalized.find((a) => a.unmappedCount || /^외 (\d+)명$/.test(a.name));
  const extra = extraItem
    ? (extraItem.unmappedCount ?? Number(extraItem.name.match(/\d+/)[0]))
    : 0;
  const shown = people.slice(0, max);
  return { shown, overflow: extra + Math.max(0, people.length - shown.length) };
}
