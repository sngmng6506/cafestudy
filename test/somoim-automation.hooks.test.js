import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerMeetupCreatedListener } from '../src/features/somoim-automation/somoim-automation.hooks.js';

function makeCtx({ internalApiKey, allowSubmit, autoRegister = false, withHooks = true } = {}) {
  const onCalls = [];
  const ctx = {
    db: {},
    config: {
      somoimAutomation: {
        internalApiKey,
        allowSubmit,
        autoRegister,
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
  const { ctx, onCalls } = makeCtx({ internalApiKey: '', allowSubmit: true, autoRegister: true });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(onCalls, []);
});

test('registerMeetupCreatedListener: allowSubmit이 false면 구독하지 않는다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'key', allowSubmit: false });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(onCalls, []);
});

test('registerMeetupCreatedListener: 둘 다 켜져 있으면 meetupCreated를 구독한다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'key', allowSubmit: true, autoRegister: true });

  registerMeetupCreatedListener(ctx);

  const created = onCalls.find((call) => call.event === 'meetupCreated');
  assert.ok(created, 'meetupCreated를 구독해야 한다');
  assert.equal(typeof created.listener, 'function');
});

test('registerMeetupCreatedListener: ctx.hooks가 없어도 예외를 던지지 않는다', () => {
  const { ctx } = makeCtx({ internalApiKey: 'key', allowSubmit: true, withHooks: false });

  assert.doesNotThrow(() => registerMeetupCreatedListener(ctx));
});

test('키가 없으면 어떤 이벤트도 구독하지 않는다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: '', allowSubmit: true, autoRegister: true });
  registerMeetupCreatedListener(ctx);
  assert.deepEqual(onCalls, []);
});

test('제출만 켜면 자동 등록은 구독하지 않지만 재시도와 취소는 구독한다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'k', allowSubmit: true, autoRegister: false });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(
    onCalls.map((call) => call.event),
    ['meetupSomoimRetryRequested', 'meetupCancelled'],
    '자동 등록은 꺼져도 호스트가 실패한 등록을 수동으로 재시도할 수는 있어야 한다',
  );
});

test('둘 다 켜면 생성/재시도/취소를 모두 구독한다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'k', allowSubmit: true, autoRegister: true });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(
    onCalls.map((call) => call.event),
    ['meetupCreated', 'meetupSomoimRetryRequested', 'meetupCancelled'],
  );
});

test('자동 등록을 나중에 끄더라도 재시도는 계속 구독된다', () => {
  // autoRegister를 켰다가 끈 것과 같은 상태(allowSubmit만 true) — 이전에 실패로
  // 쌓인 모임의 "다시 시도"가 여기서도 계속 동작해야 한다(회귀 버그).
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'k', allowSubmit: true, autoRegister: false });

  registerMeetupCreatedListener(ctx);

  const retry = onCalls.find((call) => call.event === 'meetupSomoimRetryRequested');
  assert.ok(retry, 'meetupSomoimRetryRequested를 구독해야 한다');
  assert.equal(typeof retry.listener, 'function');
});

test('autoRegister만 켜고 제출이 꺼져 있으면 아무것도 구독하지 않는다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'k', allowSubmit: false, autoRegister: true });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(onCalls, [], 'job이 submit을 담을 수 없어 모든 모임이 failed로 끝난다');
});
