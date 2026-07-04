import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetupService, deriveState } from '../src/features/meetups/meetup.service.js';

// Covers list (query) and createMeetup (transaction).
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

test('deriveState: upcoming before the scheduled time, done at/after it', () => {
  const now = Date.parse('2026-06-20T00:00:00Z');
  assert.equal(deriveState('2026-06-20T01:00:00Z', now), 'upcoming');
  assert.equal(deriveState('2026-06-19T23:00:00Z', now), 'done');
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

test('createMeetup rejects past dates', async () => {
  const service = createMeetupService({ db: fakeDb([]) });
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  await assert.rejects(
    () => service.createMeetup(validInput(past)),
    (err) => err.statusCode === 400,
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
  assert.equal(result.state, 'upcoming');
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

// db stub for participation: routes getMeetupById / COUNT(*) by SQL text.
function participationDb({ meetup, count }) {
  return {
    query: async (sql) => {
      if (sql.includes('FROM meetups')) return { rows: meetup ? [meetup] : [] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count }] };
      return { rows: [] };
    },
  };
}

test('joinMeetup adds the user and returns the new count', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 10 }, count: 2 }),
  });

  const result = await service.joinMeetup({ meetupId: 'm1', userId: 'u1' });
  assert.deepEqual(result, { meetupId: 'm1', joined: true, participantCount: 2 });
});

test('joinMeetup rejects when the meetup is full', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', scheduledAt: future, status: 'open', capacity: 2 }, count: 2 }),
  });

  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_FULL',
  );
});

test('joinMeetup rejects an already finished meetup', async () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', scheduledAt: past, status: 'open', capacity: 10 }, count: 0 }),
  });

  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_CLOSED',
  );
});

test('joinMeetup returns 404 when the meetup is missing', async () => {
  const service = createMeetupService({ db: participationDb({ meetup: null, count: 0 }) });

  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'x', userId: 'u1' }),
    (err) => err.statusCode === 404 && err.code === 'MEETUP_NOT_FOUND',
  );
});

test('leaveMeetup blocks the host from leaving', async () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', hostId: 'u1', scheduledAt: future, status: 'open', capacity: 10 }, count: 1 }),
  });

  await assert.rejects(
    () => service.leaveMeetup({ meetupId: 'm1', userId: 'u1' }),
    (err) => err.statusCode === 400 && err.code === 'HOST_CANNOT_LEAVE',
  );
});

test('leaveMeetup rejects an already finished meetup', async () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', hostId: 'u1', scheduledAt: past, status: 'open', capacity: 10 }, count: 1 }),
  });

  await assert.rejects(
    () => service.leaveMeetup({ meetupId: 'm1', userId: 'u2' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_CLOSED',
  );
});

test('leaveMeetup returns joined=false and the new count for a participant', async () => {
  const service = createMeetupService({ db: participationDb({ meetup: null, count: 1 }) });

  const result = await service.leaveMeetup({ meetupId: 'm1', userId: 'u2' });
  assert.deepEqual(result, { meetupId: 'm1', joined: false, participantCount: 1 });
});

test('cancelMeetup soft-cancels for the host', async () => {
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', hostId: 'u1', status: 'open' }, count: 1 }),
  });

  const result = await service.cancelMeetup({ meetupId: 'm1', userId: 'u1' });
  assert.deepEqual(result, { meetupId: 'm1', cancelled: true });
});

test('cancelMeetup rejects a non-host with 403', async () => {
  const service = createMeetupService({
    db: participationDb({ meetup: { id: 'm1', hostId: 'u1', status: 'open' }, count: 1 }),
  });

  await assert.rejects(
    () => service.cancelMeetup({ meetupId: 'm1', userId: 'someone-else' }),
    (err) => err.statusCode === 403 && err.code === 'NOT_MEETUP_HOST',
  );
});

test('cancelMeetup returns 404 when the meetup is missing', async () => {
  const service = createMeetupService({ db: participationDb({ meetup: null, count: 0 }) });

  await assert.rejects(
    () => service.cancelMeetup({ meetupId: 'x', userId: 'u1' }),
    (err) => err.statusCode === 404 && err.code === 'MEETUP_NOT_FOUND',
  );
});
