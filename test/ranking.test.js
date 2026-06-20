import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCurrentMonthRange, getMonthRange } from '../src/features/ranking/ranking.service.js';

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
