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

  const created = onCalls.find((call) => call.event === 'meetupCreated');
  assert.ok(created, 'meetupCreated를 구독해야 한다');
  assert.equal(typeof created.listener, 'function');
});

test('registerMeetupCreatedListener: ctx.hooks가 없어도 예외를 던지지 않는다', () => {
  const { ctx } = makeCtx({ internalApiKey: 'key', allowSubmit: true, withHooks: false });

  assert.doesNotThrow(() => registerMeetupCreatedListener(ctx));
});

test('모임 취소 이벤트도 같은 설정 가드 아래에서만 구독한다', () => {
  const offCalls = [];
  registerMeetupCreatedListener({
    db: {},
    config: { somoimAutomation: { internalApiKey: '', allowSubmit: true } },
    hooks: { on: (event) => offCalls.push(event) },
  });
  assert.deepEqual(offCalls, [], '키가 없으면 어떤 이벤트도 구독하지 않는다');

  const onCalls = [];
  registerMeetupCreatedListener({
    db: {},
    config: { somoimAutomation: { internalApiKey: 'k', allowSubmit: true } },
    hooks: { on: (event) => onCalls.push(event) },
  });
  assert.deepEqual(onCalls, ['meetupCreated', 'meetupCancelled']);
});
