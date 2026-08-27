import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createWorkerLogger,
  normalizeJobFailure,
} from '../worker/observability.js';

test('worker 로그는 공통 필드를 가진 JSON 한 줄로 기록된다', () => {
  const lines = [];
  const log = createWorkerLogger({
    write: (line) => lines.push(line),
    now: () => new Date('2026-08-27T00:00:00.000Z'),
  });

  log('error', 'job_failed', { jobId: 'job-1', errorCode: 'DEVICE_UNAVAILABLE' });

  assert.deepEqual(JSON.parse(lines[0]), {
    timestamp: '2026-08-27T00:00:00.000Z',
    level: 'error',
    service: 'somoim-worker',
    event: 'job_failed',
    jobId: 'job-1',
    errorCode: 'DEVICE_UNAVAILABLE',
  });
});

test('job 실패를 검색 가능한 공통 필드와 오류 코드로 정규화한다', () => {
  const failure = normalizeJobFailure({
    job: { id: 'job-1', type: 'create_meetup', attempts: 2 },
    outcome: {
      errorMessage: 'ADB device is offline',
      needsManualReview: false,
      result: { stage: 'resolve-device' },
    },
    reportedJob: { requeued: true },
  });

  assert.deepEqual(failure, {
    jobId: 'job-1',
    jobType: 'create_meetup',
    stage: 'resolve-device',
    attempt: 2,
    errorCode: 'DEVICE_UNAVAILABLE',
    message: 'ADB device is offline',
    retryable: true,
    needsManualReview: false,
    submitAttempted: false,
  });
});

test('알 수 없는 실패도 안정적인 fallback 코드로 정규화한다', () => {
  const failure = normalizeJobFailure({
    job: { id: 'job-2', type: 'delete_meetup' },
    outcome: { errorMessage: 'unexpected', needsManualReview: true, result: {} },
    reportedJob: { requeued: false },
  });
  assert.equal(failure.errorCode, 'WORKER_JOB_FAILED');
  assert.equal(failure.retryable, false);
});
