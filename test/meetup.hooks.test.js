import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  registerSomoimFailureListener,
  registerSomoimSuccessListener,
} from '../src/features/meetups/meetup.hooks.js';

const JOB_ID = '11111111-1111-1111-1111-111111111111';

function makeCtx({ withHooks = true } = {}) {
  const onCalls = [];
  const ctx = { db: {} };
  if (withHooks) {
    ctx.hooks = {
      on(event, listener) {
        onCalls.push({ event, listener });
      },
    };
  }
  return { ctx, onCalls };
}

test('registerSomoimFailureListener: subscribes to somoimRegistrationFailed', () => {
  const { ctx, onCalls } = makeCtx();

  registerSomoimFailureListener(ctx);

  assert.equal(onCalls.length, 1);
  assert.equal(onCalls[0].event, 'somoimRegistrationFailed');
  assert.equal(typeof onCalls[0].listener, 'function');
});

test('registerSomoimFailureListener: ctx.hooks가 없어도 예외를 던지지 않는다', () => {
  const { ctx } = makeCtx({ withHooks: false });

  assert.doesNotThrow(() => registerSomoimFailureListener(ctx));
});

test('registerSomoimFailureListener: 리스너는 jobId로 markSomoimFailedByJob을 부른다', async () => {
  const calls = [];
  const ctx = {
    db: { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 'm1', somoimState: 'failed' }] }; } },
  };
  const onCalls = [];
  ctx.hooks = { on(event, listener) { onCalls.push({ event, listener }); } };

  registerSomoimFailureListener(ctx);
  const listener = onCalls[0].listener;
  await listener({ jobId: JOB_ID });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /somoim_state = 'failed'/);
  assert.match(calls[0].sql, /somoim_job_id = \$1/);
  assert.deepEqual(calls[0].params, [JOB_ID]);
});

test('registerSomoimFailureListener: jobId가 없으면 쿼리를 실행하지 않는다', async () => {
  const calls = [];
  const ctx = {
    db: { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } },
    hooks: { on() {} },
  };
  let capturedListener;
  ctx.hooks.on = (event, listener) => { capturedListener = listener; };
  registerSomoimFailureListener(ctx);
  await capturedListener({ jobId: null });

  assert.deepEqual(calls, []);
});

test('registerSomoimSuccessListener: subscribes to somoimRegistrationSucceeded', () => {
  const { ctx, onCalls } = makeCtx();

  registerSomoimSuccessListener(ctx);

  assert.equal(onCalls.length, 1);
  assert.equal(onCalls[0].event, 'somoimRegistrationSucceeded');
  assert.equal(typeof onCalls[0].listener, 'function');
});

test('registerSomoimSuccessListener: ctx.hooks가 없어도 예외를 던지지 않는다', () => {
  const { ctx } = makeCtx({ withHooks: false });

  assert.doesNotThrow(() => registerSomoimSuccessListener(ctx));
});

test('registerSomoimSuccessListener: 리스너는 jobId로 markSomoimRegisteredByJob을 부른다', async () => {
  const calls = [];
  const ctx = {
    db: { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 'm1', somoimState: 'registered' }] }; } },
  };
  const onCalls = [];
  ctx.hooks = { on(event, listener) { onCalls.push({ event, listener }); } };

  registerSomoimSuccessListener(ctx);
  const listener = onCalls[0].listener;
  await listener({ jobId: JOB_ID });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /somoim_state = 'registered'/);
  assert.match(calls[0].sql, /somoim_job_id = \$1/);
  assert.deepEqual(calls[0].params, [JOB_ID]);
});

test('registerSomoimSuccessListener: jobId가 없으면 쿼리를 실행하지 않는다', async () => {
  const calls = [];
  const ctx = {
    db: { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } },
    hooks: {},
  };
  let capturedListener;
  ctx.hooks.on = (event, listener) => { capturedListener = listener; };
  registerSomoimSuccessListener(ctx);
  await capturedListener({ jobId: undefined });

  assert.deepEqual(calls, []);
});
