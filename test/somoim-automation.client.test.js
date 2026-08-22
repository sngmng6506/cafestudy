import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JOB_FILTERS,
  jobFilterStatus,
  jobStatusLabel,
  jobStatusTone,
} from '../client/src/shared/somoim-automation-status.js';

// 서버 CHECK 제약과 같은 목록. 여기가 어긋나면 어떤 필터로도 안 보이는 요청이 생긴다.
const SERVER_STATUSES = ['pending', 'claimed', 'succeeded', 'failed', 'needs_manual_review'];

test('every server status is reachable through exactly one filter', () => {
  const covered = JOB_FILTERS
    .filter((filter) => filter.status)
    .flatMap((filter) => filter.status.split(','));

  assert.deepEqual([...covered].sort(), [...SERVER_STATUSES].sort());
  assert.equal(new Set(covered).size, covered.length, 'a status must not appear in two filters');
});

test('the default filter asks for every status', () => {
  assert.equal(JOB_FILTERS[0].key, 'all');
  assert.equal(JOB_FILTERS[0].status, '', 'an empty status must mean no filter');
});

test('every server status has a Korean label instead of a raw value', () => {
  for (const status of SERVER_STATUSES) {
    const label = jobStatusLabel(status);
    assert.notEqual(label, status, `${status} must not leak the raw value`);
    assert.ok(!/[a-z_]/.test(label), `${status} label must not contain internal wording`);
  }
});

test('failure states are the only ones marked as danger', () => {
  assert.equal(jobStatusTone('failed'), 'ui-text-danger');
  assert.equal(jobStatusTone('needs_manual_review'), 'ui-text-danger');
  assert.notEqual(jobStatusTone('succeeded'), 'ui-text-danger');
  assert.notEqual(jobStatusTone('pending'), 'ui-text-danger');
});

test('jobFilterStatus resolves a filter key to its query value', () => {
  assert.equal(jobFilterStatus('running'), 'pending,claimed');
  assert.equal(jobFilterStatus('all'), '');
  assert.equal(jobFilterStatus('unknown-key'), '', 'an unknown key must not filter anything out');
});

test('an unknown status still renders without breaking the list', () => {
  assert.equal(jobStatusLabel('brand_new_status'), 'brand_new_status');
  assert.equal(jobStatusTone('brand_new_status'), 'ui-text-muted');
});
