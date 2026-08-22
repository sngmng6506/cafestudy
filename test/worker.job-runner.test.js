import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ManualReviewError, TransientError } from '../worker/errors.js';
import { runJob } from '../worker/job-runner.js';

const DEVICE_ID = 'R52N20ABCDE';

function dryRunJob(overrides = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    type: 'create_meetup',
    payload: {
      title: '토요일 카페 스터디',
      location: '강남역 스타벅스',
      capacity: 8,
      dryRun: true,
      submit: false,
      ...overrides,
    },
  };
}

function runWith({ job = dryRunJob(), handler, allowSubmit = false, resolveDevice } = {}) {
  const calls = [];
  const handlers = {
    create_meetup: handler ?? (async (input) => {
      calls.push(input);
      return { stoppedAt: 'before_submit', screenshotKey: 'before-submit.png' };
    }),
  };
  return {
    calls,
    promise: runJob({
      job,
      handlers,
      allowSubmit,
      resolveDevice: resolveDevice ?? (async () => DEVICE_ID),
    }),
  };
}

test('runJob: completes a dry-run and stamps mode and device on the result', async () => {
  const { promise, calls } = runWith();
  const outcome = await promise;

  assert.equal(outcome.outcome, 'complete');
  assert.deepEqual(outcome.result, {
    mode: 'dryRun',
    deviceId: DEVICE_ID,
    stoppedAt: 'before_submit',
    screenshotKey: 'before-submit.png',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'dryRun');
  assert.equal(calls[0].deviceId, DEVICE_ID);
});

test('runJob: refuses a submit job unless the worker also allows it', async () => {
  const job = dryRunJob({ dryRun: false, submit: true });
  const { promise, calls } = runWith({ job, allowSubmit: false });
  const outcome = await promise;

  assert.equal(outcome.outcome, 'fail');
  assert.equal(outcome.needsManualReview, true);
  assert.match(outcome.errorMessage, /ALLOW_SOMOIM_SUBMIT/);
  assert.equal(calls.length, 0, 'handler must not run when submit is blocked');
});

test('runJob: allows submit only when the worker switch is on', async () => {
  const job = dryRunJob({ dryRun: false, submit: true });
  const { promise, calls } = runWith({ job, allowSubmit: true });
  const outcome = await promise;

  assert.equal(outcome.outcome, 'complete');
  assert.equal(outcome.result.mode, 'submit');
  assert.equal(calls[0].mode, 'submit');
});

test('runJob: rejects dryRun/submit combinations the contract does not allow', async () => {
  for (const payload of [{ dryRun: true, submit: true }, { dryRun: false, submit: false }]) {
    const { promise, calls } = runWith({ job: dryRunJob(payload), allowSubmit: true });
    const outcome = await promise;

    assert.equal(outcome.outcome, 'fail');
    assert.equal(outcome.needsManualReview, true);
    assert.match(outcome.errorMessage, /Invalid dryRun\/submit combination/);
    assert.equal(calls.length, 0);
  }
});

test('runJob: sends unknown job types to manual review', async () => {
  const job = { ...dryRunJob(), type: 'delete_everything' };
  const outcome = await runJob({
    job,
    handlers: {},
    resolveDevice: async () => DEVICE_ID,
  });

  assert.equal(outcome.outcome, 'fail');
  assert.equal(outcome.needsManualReview, true);
  assert.match(outcome.errorMessage, /No handler for job type/);
});

test('runJob: does not run the handler when the device cannot be resolved', async () => {
  const { promise, calls } = runWith({
    resolveDevice: async () => {
      throw new ManualReviewError('Device R52N20ABCDE is unauthorized');
    },
  });
  const outcome = await promise;

  assert.equal(outcome.outcome, 'fail');
  assert.equal(outcome.needsManualReview, true);
  assert.match(outcome.errorMessage, /unauthorized/);
  assert.equal(calls.length, 0);
});

test('runJob: keeps handler details on the failure result', async () => {
  const { promise } = runWith({
    handler: async () => {
      throw new ManualReviewError('Create button was not found', { stage: 'open_create_screen' });
    },
  });
  const outcome = await promise;

  assert.equal(outcome.needsManualReview, true);
  assert.deepEqual(outcome.result, { stage: 'open_create_screen' });
});

test('runJob: only a TransientError avoids manual review', async () => {
  const { promise } = runWith({
    handler: async () => {
      throw new TransientError('app launch timed out before any input');
    },
  });
  assert.equal((await promise).needsManualReview, false);
});

test('runJob: an unexpected error still needs manual review', async () => {
  const { promise } = runWith({
    handler: async () => {
      throw new TypeError('cannot read properties of undefined');
    },
  });
  const outcome = await promise;

  assert.equal(outcome.outcome, 'fail');
  assert.equal(outcome.needsManualReview, true, 'ambiguous failures default to manual review');
});

test('runJob: tolerates a handler that returns nothing', async () => {
  const { promise } = runWith({ handler: async () => undefined });
  const outcome = await promise;

  assert.equal(outcome.outcome, 'complete');
  assert.deepEqual(outcome.result, { mode: 'dryRun', deviceId: DEVICE_ID });
});
