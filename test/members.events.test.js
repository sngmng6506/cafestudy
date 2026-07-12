import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractFaceId,
  extractDateTimeFromThumbnail,
  parseDateTimeText,
  parseCapacity,
  normalizeEvent,
  buildFaceIdMap,
} from '../src/features/members/members.events.js';

test('extractFaceId: 얼굴 URL에서 UUID 추출 (1t/1n 접미사)', () => {
  const base = 'https://cdn.example/364dee92-0ec8-11f0-8312-0a1ea535baaf';
  assert.equal(extractFaceId(`${base}1t.png`), '364dee92-0ec8-11f0-8312-0a1ea535baaf');
  assert.equal(extractFaceId(`${base}1n.png`), '364dee92-0ec8-11f0-8312-0a1ea535baaf');
  assert.equal(extractFaceId(null), null);
  assert.equal(extractFaceId('https://cdn.example/i_clock.svg'), null);
});

// 기대값은 절대 UTC 인스턴트로 고정한다 (KST = UTC+9).
// 로컬 getter로 검증하면 테스트 러너의 타임존에 따라 같은 버그를 놓친다.
test('extractDateTimeFromThumbnail: 썸네일 URL의 KST 시각 -> UTC 인스턴트', () => {
  const url = 'https://cdn.example/eb377bbe...667c1202607041000s1.png';
  const dt = extractDateTimeFromThumbnail(url);
  assert.equal(dt.toISOString(), '2026-07-04T01:00:00.000Z'); // KST 7/4 10:00
  assert.equal(extractDateTimeFromThumbnail('no-date.png'), null);
});

test('parseDateTimeText: 오전/오후 12시간제 변환 (KST -> UTC)', () => {
  const pm = parseDateTimeText('7/5(일) 오후 1:00', 2026);
  assert.equal(pm.toISOString(), '2026-07-05T04:00:00.000Z'); // KST 13:00
  const am = parseDateTimeText('7/4(토) 오전 10:00', 2026);
  assert.equal(am.toISOString(), '2026-07-04T01:00:00.000Z'); // KST 10:00
  // 정오/자정 경계
  assert.equal(
    parseDateTimeText('1/1(수) 오후 12:00', 2026).toISOString(),
    '2026-01-01T03:00:00.000Z', // KST 12:00
  );
  assert.equal(
    parseDateTimeText('1/1(수) 오전 12:00', 2026).toISOString(),
    '2025-12-31T15:00:00.000Z', // KST 1/1 00:00
  );
  assert.equal(parseDateTimeText('잘못된 텍스트', 2026), null);
});

test('parseCapacity: "7/10" -> {joined:7, capacity:10}', () => {
  assert.deepEqual(parseCapacity('7/10'), { joined: 7, capacity: 10 });
  assert.deepEqual(parseCapacity('10 / 10'), { joined: 10, capacity: 10 });
  assert.deepEqual(parseCapacity(null), { joined: null, capacity: null });
});

test('buildFaceIdMap: face_id/faceId 둘 다 지원', () => {
  const map = buildFaceIdMap([
    { face_id: 'a', name: '이상명' },
    { faceId: 'b', name: '유인완' },
    { name: '얼굴없음' },
  ]);
  assert.deepEqual(map, { a: '이상명', b: '유인완' });
});

test('normalizeEvent: 썸네일 날짜 우선, 참가자 이름 매핑, 미매핑 null', () => {
  const card = {
    thumbnailSrc: 'https://cdn/eb377202607041000s1.png',
    title: '26.',
    dateTimeText: '7/4(토) 오전 10:00',
    location: '아비아채 지하1층',
    cost: '각자 커피값',
    attendeeFaceSrcs: [
      'https://cdn/364dee92-0ec8-11f0-8312-0a1ea535baaf1t.png',
      'https://cdn/abcdef00-1111-2222-3333-4444555566661t.png',
    ],
    capacityText: '7/10',
  };
  const memberByFaceId = { '364dee92-0ec8-11f0-8312-0a1ea535baaf': '이상명' };
  const ev = normalizeEvent(card, { crawlYear: 2026, memberByFaceId });

  assert.equal(ev.title, '26.');
  assert.equal(ev.scheduledAt, '2026-07-04T01:00:00.000Z'); // KST 7/4 10:00
  assert.equal(ev.location, '아비아채 지하1층');
  assert.equal(ev.joinedCount, 7);
  assert.equal(ev.capacity, 10);
  assert.equal(ev.attendees[0].name, '이상명');
  assert.equal(ev.attendees[0].isHost, true);
  assert.equal(ev.attendees[1].name, null); // 미매핑은 null, faceId는 유지
  assert.equal(ev.attendees[1].isHost, false);
  assert.ok(ev.attendees[1].faceId);
});

test('normalizeEvent: 썸네일 날짜 없으면 텍스트 fallback', () => {
  const card = {
    thumbnailSrc: 'https://cdn/no-date.png',
    title: '비정기',
    dateTimeText: '7/5(일) 오후 1:00',
    attendeeFaceSrcs: [],
    capacityText: null,
  };
  const ev = normalizeEvent(card, { crawlYear: 2026 });
  assert.equal(ev.scheduledAt, '2026-07-05T04:00:00.000Z'); // KST 7/5 13:00
  assert.equal(ev.joinedCount, null);
});

test('normalizeEvent: 중복 얼굴 제거', () => {
  const dup = 'https://cdn/364dee92-0ec8-11f0-8312-0a1ea535baaf1t.png';
  const ev = normalizeEvent(
    { thumbnailSrc: '', title: 't', attendeeFaceSrcs: [dup, dup] },
    {},
  );
  assert.equal(ev.attendees.length, 1);
});
