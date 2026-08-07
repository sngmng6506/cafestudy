// 소모임(크롤링) 정모 이벤트를 프론트에서 다루는 공통 로직.

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

export function somoimEventToMeetup(event) {
  const scheduledAt = event.scheduledAt;
  const lifecycleState = new Date(scheduledAt) < new Date() ? 'done' : 'upcoming';
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
    lifecycleState,
    // Deprecated compatibility field while existing views migrate.
    state: lifecycleState,
  };
}

export function somoimAppLink(userAgent = navigator.userAgent) {
  if (/android/i.test(userAgent)) {
    return {
      href: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.friendscube.somoim;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.friendscube.somoim;end',
      target: '_self',
    };
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return { href: 'https://apps.apple.com/kr/app/id582910479', target: '_blank' };
  }
  return { href: 'https://www.somoim.co.kr', target: '_blank' };
}

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
