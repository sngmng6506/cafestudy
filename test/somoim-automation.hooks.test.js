import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerMeetupCreatedListener } from '../src/features/somoim-automation/somoim-automation.hooks.js';

function makeCtx({ internalApiKey, allowSubmit, withHooks = true } = {}) {
  const onCalls = [];
  const ctx = {
    db: {},
    config: {
      somoimAutomation: {
        internalApiKey,
        allowSubmit,
        staleClaimSeconds: 900,
        maxAttempts: 3,
      },
    },
  };
  if (withHooks) {
    ctx.hooks = {
      on(event, listener) {
        onCalls.push({ event, listener });
      },
    };
  }
  return { ctx, onCalls };
}

test('registerMeetupCreatedListener: internalApiKey가 없으면 구독하지 않는다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: '', allowSubmit: true });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(onCalls, []);
});

test('registerMeetupCreatedListener: allowSubmit이 false면 구독하지 않는다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'key', allowSubmit: false });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(onCalls, []);
});

test('registerMeetupCreatedListener: 둘 다 켜져 있으면 meetupCreated를 구독한다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'key', allowSubmit: true });

  registerMeetupCreatedListener(ctx);

  assert.equal(onCalls.length, 1);
  assert.equal(onCalls[0].event, 'meetupCreated');
  assert.equal(typeof onCalls[0].listener, 'function');
});

test('registerMeetupCreatedListener: ctx.hooks가 없어도 예외를 던지지 않는다', () => {
  const { ctx } = makeCtx({ internalApiKey: 'key', allowSubmit: true, withHooks: false });

  assert.doesNotThrow(() => registerMeetupCreatedListener(ctx));
});
