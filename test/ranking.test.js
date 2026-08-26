import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRankingService, getCurrentMonthRange, getMonthRange } from '../src/features/ranking/ranking.service.js';

test('getMonthRange computes a specific past month in Asia/Seoul', () => {
  // January 2026 (month0 = 0) in KST starts 2025-12-31T15:00Z and ends 2026-01-31T15:00Z.
  const { start, end } = getMonthRange(2026, 0);
  assert.equal(start, '2025-12-31T15:00:00.000Z');
  assert.equal(end, '2026-01-31T15:00:00.000Z');
});

test('month range uses Asia/Seoul boundaries, not UTC', () => {
  // 2026-06-01 03:00 KST is still 2026-05-31 18:00 UTC.
  // A UTC-based range would wrongly bucket this into May.
  const earlyJuneKst = new Date('2026-05-31T18:00:00.000Z');
  const { start, end } = getCurrentMonthRange(earlyJuneKst);

  // Start of June in KST = 2026-05-31T15:00:00Z, end = 2026-06-30T15:00:00Z.
  assert.equal(start, '2026-05-31T15:00:00.000Z');
  assert.equal(end, '2026-06-30T15:00:00.000Z');
});

test('month range wraps across the year boundary', () => {
  // 2027-01-01 08:00 KST = 2026-12-31 23:00 UTC.
  const newYearKst = new Date('2026-12-31T23:00:00.000Z');
  const { start, end } = getCurrentMonthRange(newYearKst);

  assert.equal(start, '2026-12-31T15:00:00.000Z'); // start of Jan 2027 in KST
  assert.equal(end, '2027-01-31T15:00:00.000Z'); // start of Feb 2027 in KST
});

test('range is half-open: start is inclusive, end is exclusive width of one month', () => {
  const midMonth = new Date('2026-06-15T00:00:00.000Z');
  const { start, end } = getCurrentMonthRange(midMonth);

  assert.ok(new Date(start) < new Date(end));
});

// --- 정모 참석 순위 ---

function serviceWithSpy() {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  return { service: createRankingService({ db, storage: null }), calls };
}

test('참석 순위: 월을 주지 않으면 전체 기간이다', async () => {
  // 월간 랭킹은 생략하면 이번 달이지만, 참석은 "지금까지 몇 번"이 기본이다.
  const { service, calls } = serviceWithSpy();

  await service.getAttendanceRanking();

  assert.equal(calls[0].params[0], null, 'start가 비어야 전체 기간이다');
  assert.equal(calls[0].params[1], null);
});

test('참석 순위: 월을 주면 그 달의 KST 경계로 좁힌다', async () => {
  const { service, calls } = serviceWithSpy();

  await service.getAttendanceRanking({ year: 2026, month: 8 });

  assert.equal(calls[0].params[0], '2026-07-31T15:00:00.000Z');
  assert.equal(calls[0].params[1], '2026-08-31T15:00:00.000Z');
});

test('참석 순위: 포인트가 아니라 크롤링한 참석 기록에서 센다', async () => {
  // 실제로 모임에 나온 것은 소모임 앱이 기록한다. 앱의 참여 버튼이나 인증
  // 포인트와는 별개라, point_logs를 세면 다른 것을 세게 된다.
  const { service, calls } = serviceWithSpy();

  await service.getAttendanceRanking();

  assert.match(calls[0].sql, /FROM somoim_event_attendees/);
  assert.ok(!/point_logs/.test(calls[0].sql));
  // users와 이어지지 않는 참석자는 셀 수 없다.
  assert.match(calls[0].sql, /JOIN somoim_members sm ON sm\.face_id = a\.face_id/);
});
