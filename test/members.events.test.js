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

test('extractDateTimeFromThumbnail: 썸네일 URL에서 연도 포함 시각 추출', () => {
  const url = 'https://cdn.example/eb377bbe...667c1202607041000s1.png';
  const dt = extractDateTimeFromThumbnail(url);
  assert.equal(dt.getFullYear(), 2026);
  assert.equal(dt.getMonth(), 6); // 0-indexed = 7월
  assert.equal(dt.getDate(), 4);
  assert.equal(dt.getHours(), 10);
  assert.equal(extractDateTimeFromThumbnail('no-date.png'), null);
});

test('parseDateTimeText: 오전/오후 12시간제 변환', () => {
  const pm = parseDateTimeText('7/5(일) 오후 1:00', 2026);
  assert.equal(pm.getHours(), 13);
  const am = parseDateTimeText('7/4(토) 오전 10:00', 2026);
  assert.equal(am.getHours(), 10);
  // 정오/자정 경계
  assert.equal(parseDateTimeText('1/1(수) 오후 12:00', 2026).getHours(), 12);
  assert.equal(parseDateTimeText('1/1(수) 오전 12:00', 2026).getHours(), 0);
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
  assert.equal(ev.scheduledAt, new Date(2026, 6, 4, 10, 0).toISOString());
  assert.equal(ev.location, '아비아채 지하1층');
  assert.equal(ev.joinedCount, 7);
  assert.equal(ev.capacity, 10);
  assert.equal(ev.attendees[0].name, '이상명');
  assert.equal(ev.attendees[1].name, null); // 미매핑은 null, faceId는 유지
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
  assert.equal(ev.scheduledAt, new Date(2026, 6, 5, 13, 0).toISOString());
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
