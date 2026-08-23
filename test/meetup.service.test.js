import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetupQueries } from '../src/features/meetups/meetup.queries.js';
import { createMeetupService, deriveState } from '../src/features/meetups/meetup.service.js';

function fakeDb(rows) {
  return {
    query: async () => ({ rows }),
    transaction: async (callback) => callback({ query: async () => ({ rows }) }),
  };
}

const validInput = (scheduledAt) => ({
  hostId: 'host-1',
  title: '토요일 스터디',
  description: '알고리즘 문제 풀이',
  location: '강남역',
  scheduledAt,
  capacity: 6,
});

test('deriveState: scheduled time 기준으로 upcoming/done을 계산한다', () => {
  const now = Date.parse('2026-06-20T00:00:00Z');
  assert.equal(deriveState('2026-06-20T01:00:00Z', now), 'upcoming');
  assert.equal(deriveState('2026-06-20T00:00:00Z', now), 'done');
});

test('createMeetup rejects times within 30 minutes from now', async () => {
  const service = createMeetupService({ db: fakeDb([]) });
  const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await assert.rejects(
    () => service.createMeetup(validInput(soon)),
    (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR',
  );
});

test('createMeetup rejects an invalid capacity', async () => {
  const service = createMeetupService({ db: fakeDb([]) });
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await assert.rejects(
    () => service.createMeetup({ ...validInput(future), capacity: 0 }),
    (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR',
  );
});

test('createMeetup includes the host as the first participant', async () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const row = { id: '1', hostId: 'host-1', scheduledAt: future, status: 'open', capacity: 6 };
  const service = createMeetupService({ db: fakeDb([row]) });
  const result = await service.createMeetup(validInput(future));
  assert.equal(result.participantCount, 1);
  assert.equal(result.joined, true);
  assert.equal(result.isHost, true);
});

test('listMeetups attaches derived state to each meetup', async () => {
  const rows = [
    { id: 'past', scheduledAt: '2020-01-01T00:00:00Z' },
    { id: 'future', scheduledAt: '2999-01-01T00:00:00Z' },
  ];
  const service = createMeetupService({ db: fakeDb(rows) });
  const list = await service.listMeetups('user-1');
  assert.equal(list.find((m) => m.id === 'past').state, 'done');
  assert.equal(list.find((m) => m.id === 'future').state, 'upcoming');
});

test('listMeetups excludes Somoim-materialized meetups from the general meetup API', async () => {
  let capturedSql = '';
  const queries = createMeetupQueries({
    query: async (sql) => {
      capturedSql = sql;
      return { rows: [] };
    },
  });

  await queries.listMeetups('user-1');

  assert.match(capturedSql, /m\.status = 'open'/);
  assert.match(capturedSql, /m\.source_type = 'app'/);
});

function participationDb({ meetup, count = 0, alreadyJoined = false }) {
  const directQuery = async (sql) => {
    if (sql.includes('FROM meetups')) return { rows: meetup ? [meetup] : [] };
    if (sql.includes('COUNT(*)')) return { rows: [{ count }] };
    return { rows: [] };
  };

  return {
    query: directQuery,
    transaction: async (callback) => callback({
      query: async (sql) => {
        if (sql.includes('FOR UPDATE')) return { rows: meetup ? [meetup] : [] };
        if (sql.includes('BOOL_OR')) return { rows: [{ count, alreadyJoined }] };
        return { rows: [] };
      },
    }),
  };
}

test('joinMeetup returns the transactional participant count', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 10 },
      count: 1,
    }),
  });
  const result = await service.joinMeetup({ meetupId: 'm1', userId: 'u1' });
  assert.deepEqual(result, { meetupId: 'm1', joined: true, participantCount: 2 });
});

test('joinMeetup is idempotent for an existing participant', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 2 },
      count: 2,
      alreadyJoined: true,
    }),
  });
  const result = await service.joinMeetup({ meetupId: 'm1', userId: 'u1' });
  assert.equal(result.participantCount, 2);
});

test('joinMeetup rejects when the meetup is full', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 2 },
      count: 2,
    }),
  });
  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_FULL',
  );
});

test('joinMeetup rejects a closed meetup even before scheduled time', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: future, status: 'closed', capacity: 10 },
    }),
  });
  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_CLOSED',
  );
});

test('joinMeetup rejects an already finished meetup', async () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: past, status: 'open', capacity: 10 },
    }),
  });
  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_CLOSED',
  );
});

test('joinMeetup returns 404 when the meetup is missing', async () => {
  const service = createMeetupService({ db: participationDb({ meetup: null }) });
  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'x', userId: 'u1' }),
    (err) => err.statusCode === 404 && err.code === 'MEETUP_NOT_FOUND',
  );
});

test('joinMeetup: 소모임 등록 중이면 참가를 막는다', async () => {
  const service = createMeetupService({
    db: {},
    storage: null,
    hooks: null,
    queries: { async joinMeetup() { return { outcome: 'somoim_pending' }; } },
  });

  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'meetup-1', userId: 'user-1' }),
    (error) => {
      assert.equal(error.code, 'MEETUP_SOMOIM_PENDING');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('joinMeetup rejects via the real query layer when somoimState is pending', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 10, somoimState: 'pending' },
      count: 1,
    }),
  });
  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_SOMOIM_PENDING',
  );
});

test('joinMeetup succeeds via the real query layer when somoimState is none', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 10, somoimState: 'none' },
      count: 1,
    }),
  });
  const result = await service.joinMeetup({ meetupId: 'm1', userId: 'u1' });
  assert.deepEqual(result, { meetupId: 'm1', joined: true, participantCount: 2 });
});

test('leaveMeetup blocks the host from leaving', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({
      meetup: { id: 'm1', hostId: 'u1', scheduledAt: future, status: 'open', capacity: 10 },
      count: 1,
    }),
  });
  await assert.rejects(
    () => service.leaveMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'HOST_CANNOT_LEAVE',
  );
});

test('cancelMeetup rejects a non-host with 403', async () => {
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', hostId: 'u1', status: 'open' } }),
  });
  await assert.rejects(
    () => service.cancelMeetup({ meetupId: 'm1', userId: 'someone-else' }),
    (err) => err.statusCode === 403 && err.code === 'NOT_MEETUP_HOST',
  );
});

function serviceWithHooks({ listenerResult } = {}) {
  const calls = { emitted: [], stateUpdates: [] };
  const queries = {
    async createMeetup(input) {
      return { id: 'meetup-1', ...input, status: 'open', somoimState: 'none', somoimJobId: null };
    },
    async setSomoimState(input) {
      calls.stateUpdates.push(input);
      return { id: input.meetupId, somoimState: input.state, somoimJobId: input.jobId };
    },
  };
  const hooks = {
    on() {},
    async emit(event, payload) {
      calls.emitted.push({ event, payload });
      return listenerResult === undefined ? [] : [listenerResult];
    },
  };
  return { service: createMeetupService({ db: {}, storage: null, hooks, queries }), calls };
}

const VALID_INPUT = {
  hostId: '00000000-0000-0000-0000-000000000001',
  title: '토요일 카페 스터디',
  description: null,
  location: '강남역 스타벅스',
  scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
  capacity: 4,
};

test('createMeetup: 모임 생성 후 meetupCreated를 발행한다', async () => {
  const { service, calls } = serviceWithHooks();
  await service.createMeetup(VALID_INPUT);

  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].event, 'meetupCreated');
  assert.equal(calls.emitted[0].payload.id, 'meetup-1');
});

test('createMeetup: 듣는 리스너가 없으면 상태를 건드리지 않는다', async () => {
  const { service, calls } = serviceWithHooks();
  const meetup = await service.createMeetup(VALID_INPUT);

  assert.deepEqual(calls.stateUpdates, [], '자동화가 꺼진 환경에서는 지금과 똑같이 동작해야 한다');
  assert.equal(meetup.somoimState, 'none');
});

test('createMeetup: 리스너가 jobId를 주면 pending으로 바꾼다', async () => {
  const { service, calls } = serviceWithHooks({ listenerResult: { jobId: 'job-1' } });
  const meetup = await service.createMeetup(VALID_INPUT);

  assert.deepEqual(calls.stateUpdates, [{ meetupId: 'meetup-1', state: 'pending', jobId: 'job-1' }]);
  assert.equal(meetup.somoimState, 'pending', '응답이 바로 등록 중으로 보여야 한다');
});

test('retrySomoimRegistration: 개설자가 아니면 거부한다', async () => {
  const service = createMeetupService({
    db: {}, storage: null, hooks: null,
    queries: { async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'failed' }; } },
  });

  await assert.rejects(
    () => service.retrySomoimRegistration({ meetupId: 'm1', userId: 'other' }),
    (error) => { assert.equal(error.code, 'NOT_MEETUP_HOST'); return true; },
  );
});

test('retrySomoimRegistration: failed가 아니면 거부한다', async () => {
  const service = createMeetupService({
    db: {}, storage: null, hooks: null,
    queries: { async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'registered' }; } },
  });

  await assert.rejects(
    () => service.retrySomoimRegistration({ meetupId: 'm1', userId: 'host' }),
    (error) => { assert.equal(error.code, 'MEETUP_SOMOIM_NOT_FAILED'); return true; },
  );
});

test('retrySomoimRegistration: 새 job을 만들고 pending으로 되돌린다', async () => {
  const updates = [];
  const service = createMeetupService({
    db: {}, storage: null,
    hooks: { on() {}, async emit() { return [{ jobId: 'job-2' }]; } },
    queries: {
      async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'failed' }; },
      async setSomoimState(input) { updates.push(input); return { somoimState: input.state }; },
    },
  });

  const result = await service.retrySomoimRegistration({ meetupId: 'm1', userId: 'host' });

  assert.equal(result.somoimState, 'pending');
  assert.deepEqual(updates, [{ meetupId: 'm1', state: 'pending', jobId: 'job-2' }]);
});

test('retrySomoimRegistration: 자동화가 꺼져있으면 503으로 거부한다', async () => {
  const service = createMeetupService({
    db: {}, storage: null,
    hooks: { on() {}, async emit() { return []; } },
    queries: {
      async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'failed' }; },
      async setSomoimState() { throw new Error('setSomoimState should not be called'); },
    },
  });

  await assert.rejects(
    () => service.retrySomoimRegistration({ meetupId: 'm1', userId: 'host' }),
    (error) => {
      assert.equal(error.code, 'SOMOIM_AUTOMATION_UNAVAILABLE');
      assert.equal(error.statusCode, 503);
      return true;
    },
  );
});

test('retrySomoimRegistration: 모임이 없으면 404를 던진다', async () => {
  const service = createMeetupService({
    db: {}, storage: null, hooks: null,
    queries: { async getMeetupById() { return null; } },
  });

  await assert.rejects(
    () => service.retrySomoimRegistration({ meetupId: 'missing', userId: 'host' }),
    (error) => { assert.equal(error.code, 'MEETUP_NOT_FOUND'); return true; },
  );
});
