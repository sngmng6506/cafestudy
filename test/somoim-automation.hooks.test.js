import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerMeetupCreatedListener } from '../src/features/somoim-automation/somoim-automation.hooks.js';

const JOB_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '00000000-0000-0000-0000-000000000001';

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

// 취소 리스너가 등록 단계에 따라 다른 일을 하는지 본다. db에 닿는 SQL을 받아
// 어느 경로로 갔는지 확인한다.
function cancelListener({ jobCancellable = true, submitAttempted = false } = {}) {
  const statements = [];
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'k', allowSubmit: true, autoRegister: true });
  ctx.db = {
    async query(sql, params) {
      statements.push({ sql, params });
      // 큐에서 멈추기: 이미 집어간 job이면 아무 행도 안 바뀐다.
      if (/UPDATE somoim_automation_jobs/.test(sql) && /status = 'pending'/.test(sql)) {
        return { rows: jobCancellable ? [{ id: JOB_ID, status: 'failed' }] : [] };
      }
      if (/SELECT/.test(sql)) {
        return { rows: [{ id: JOB_ID, submitAttemptedAt: submitAttempted ? new Date() : null }] };
      }
      return { rows: [{ id: JOB_ID, status: 'pending' }] };
    },
  };
  registerMeetupCreatedListener(ctx);
  return {
    listener: onCalls.find((call) => call.event === 'meetupCancelled').listener,
    statements,
  };
}

test('취소 리스너: 등록 대기 중이면 큐의 job을 멈춘다', async () => {
  const { listener, statements } = cancelListener();

  await listener({ somoimState: 'pending', somoimJobId: JOB_ID, hostId: USER_ID });

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /UPDATE somoim_automation_jobs/);
  assert.match(statements[0].sql, /status = 'pending'/, '아직 안 집어간 job만 멈춘다');
});

test('취소 리스너: 이미 등록됐으면 지우는 job을 만든다', async () => {
  const { listener, statements } = cancelListener();

  await listener({
    somoimState: 'registered',
    somoimJobId: JOB_ID,
    hostId: USER_ID,
    title: '토요일 카페 스터디',
    scheduledAt: '2026-08-29T01:00:00.000Z',
  });

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /INSERT INTO somoim_automation_jobs/);
  const [, type, payload] = statements[0].params;
  assert.equal(type, 'delete_meetup');
  assert.equal(payload.title, '토요일 카페 스터디');
  assert.equal(payload.submit, true);
});

test('취소 리스너: 등록 전이고 job도 없으면 아무 일도 하지 않는다', async () => {
  const { listener, statements } = cancelListener();

  assert.equal(await listener({ somoimState: 'none' }), undefined);
  assert.equal(await listener({ somoimState: 'failed' }), undefined, '실패한 등록은 앱에 정모가 없다');
  assert.equal(await listener({ somoimState: 'pending', somoimJobId: null }), undefined);
  assert.equal(await listener(undefined), undefined, 'payload가 없어도 터지지 않는다');
  assert.deepEqual(statements, [], 'db에 아무것도 쓰지 않는다');
});

test('autoRegister만 켜고 제출이 꺼져 있으면 아무것도 구독하지 않는다', () => {
  const { ctx, onCalls } = makeCtx({ internalApiKey: 'k', allowSubmit: false, autoRegister: true });

  registerMeetupCreatedListener(ctx);

  assert.deepEqual(onCalls, [], 'job이 submit을 담을 수 없어 모든 모임이 failed로 끝난다');
});

test('취소 리스너: 이미 집어간 job이 제출을 시도했으면 지우러 간다', async () => {
  // 실기기에서 겪은 상황: 제출 버튼을 누른 뒤 확인 화면을 읽다 adb가 깨져 job은
  // 실패로 보고됐는데 정모는 앱에 만들어져 있었다. somoim_state가 pending에
  // 머물러, 그 모임을 취소해도 아무것도 지워지지 않았다.
  const { listener, statements } = cancelListener({ jobCancellable: false, submitAttempted: true });

  await listener({
    somoimState: 'pending',
    somoimJobId: JOB_ID,
    hostId: USER_ID,
    title: '토요일 카페 스터디',
    scheduledAt: '2026-08-29T01:00:00.000Z',
  });

  const insert = statements.find((s) => /INSERT INTO somoim_automation_jobs/.test(s.sql));
  assert.ok(insert, '삭제 job을 만들어야 한다');
  assert.equal(insert.params[1], 'delete_meetup');
});

test('취소 리스너: 제출을 시도하지 않았으면 지우러 가지 않는다', async () => {
  // 앱에 아무것도 안 만들어졌다. 삭제 job을 만들면 사람 손이 헛되이 불려 나온다.
  const { listener, statements } = cancelListener({ jobCancellable: false, submitAttempted: false });

  await listener({ somoimState: 'pending', somoimJobId: JOB_ID, hostId: USER_ID, title: 'ㅇ', scheduledAt: '2026-08-29T01:00:00.000Z' });

  assert.ok(!statements.some((s) => /INSERT INTO/.test(s.sql)));
});

test('취소 리스너: 큐에서 멈췄으면 거기서 끝난다', async () => {
  // 아직 안 집어갔으므로 앱에는 아무것도 없다.
  const { listener, statements } = cancelListener({ jobCancellable: true });

  await listener({ somoimState: 'pending', somoimJobId: JOB_ID, hostId: USER_ID, title: 'ㅇ', scheduledAt: '2026-08-29T01:00:00.000Z' });

  assert.ok(!statements.some((s) => /INSERT INTO/.test(s.sql)), '지우러 가지 않는다');
});
