import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  somoimAttendees,
  somoimEventToMeetup,
  attendeeStack,
} from '../client/src/shared/useSomoimEvents.js';

test('somoimAttendees: 매핑된 이름 + 미매핑은 "외 N명"으로', () => {
  const event = {
    joinedCount: 7,
    attendees: [{ name: '이상명' }, { name: '유인완' }, { name: null }],
  };
  // 이름 2명, 참여 7명 → 미매핑 5명
  assert.deepEqual(somoimAttendees(event), ['이상명', '유인완', '외 5명']);
});

test('somoimAttendees: 전원 매핑되면 "외" 없음', () => {
  const event = { joinedCount: 2, attendees: [{ name: 'A' }, { name: 'B' }] };
  assert.deepEqual(somoimAttendees(event), ['A', 'B']);
});

test('somoimAttendees: 참여 인원이 이름보다 적어도 음수 방지', () => {
  const event = { joinedCount: 1, attendees: [{ name: 'A' }, { name: 'B' }] };
  assert.deepEqual(somoimAttendees(event), ['A', 'B']); // 외 -1명 안 나옴
});

test('somoimEventToMeetup: 코어 필드 매핑 + readonly + 과거는 done', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const m = somoimEventToMeetup({
    id: 'e1',
    title: '26.',
    cost: '각자 커피값',
    location: '아비아채',
    scheduledAt: past,
    joinedCount: 3,
    capacity: 10,
    attendees: [{ name: 'A' }],
  });
  assert.equal(m.id, 'somoim-e1');
  assert.equal(m.description, '참가비 각자 커피값');
  assert.equal(m.readonly, true);
  assert.equal(m.state, 'done');
  assert.equal(m.participantCount, 3);
  assert.equal(m.capacity, 10);
});

test('somoimEventToMeetup: 미래는 upcoming, 비용 없으면 빈 설명', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const m = somoimEventToMeetup({ id: 'e2', title: 't', scheduledAt: future, joinedCount: 0 });
  assert.equal(m.state, 'upcoming');
  assert.equal(m.description, '');
  assert.equal(m.location, '장소 미정');
});

test('attendeeStack: 5명 초과는 overflow로, "외 N명" 합산', () => {
  const stack = attendeeStack(['A', 'B', 'C', 'D', 'E', 'F', '외 3명']);
  assert.equal(stack.shown.length, 5); // A~E
  assert.equal(stack.overflow, 3 + 1); // 외 3명 + 넘친 F 1명
});

test('attendeeStack: 빈 입력 안전', () => {
  assert.deepEqual(attendeeStack(null), { shown: [], overflow: 0 });
  assert.deepEqual(attendeeStack([]), { shown: [], overflow: 0 });
});
