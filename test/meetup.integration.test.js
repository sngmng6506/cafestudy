import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { createDb } from '../src/core/db.js';
import { createMeetupService } from '../src/features/meetups/meetup.service.js';
import { createMeetupQueries } from '../src/features/meetups/meetup.queries.js';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const run = connectionString ? test : test.skip;
let pool;
let db;
let queries;

before(() => {
  if (!connectionString) return;
  pool = new Pool({ connectionString });
  db = createDb({ connectionString });
  queries = createMeetupQueries(db);
});

after(async () => {
  await db?.close();
  await pool?.end();
});

async function cleanupMeetup(meetupId, userIds) {
  await pool.query('DELETE FROM participants WHERE meetup_id = $1', [meetupId]);
  await pool.query('DELETE FROM meetups WHERE id = $1', [meetupId]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
}

run('동시 참가 요청은 마지막 한 자리를 초과하지 않는다', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const users = await pool.query(
    `
      INSERT INTO users (nickname)
      VALUES ($1), ($2), ($3)
      RETURNING id
    `,
    [`host-${suffix}`, `joiner-a-${suffix}`, `joiner-b-${suffix}`],
  );
  const [host, joinerA, joinerB] = users.rows;

  const meetupResult = await pool.query(
    `
      INSERT INTO meetups (host_id, title, location, scheduled_at, capacity, status)
      VALUES ($1, $2, $3, now() + interval '2 hours', 2, 'open')
      RETURNING id
    `,
    [host.id, `concurrency-${suffix}`, 'test cafe'],
  );
  const meetupId = meetupResult.rows[0].id;

  try {
    await pool.query(
      'INSERT INTO participants (meetup_id, user_id) VALUES ($1, $2)',
      [meetupId, host.id],
    );

    const service = createMeetupService({ db });
    const results = await Promise.allSettled([
      service.joinMeetup({ meetupId, userId: joinerA.id }),
      service.joinMeetup({ meetupId, userId: joinerB.id }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected?.reason?.code, 'MEETUP_FULL');

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM participants WHERE meetup_id = $1',
      [meetupId],
    );
    assert.equal(countResult.rows[0].count, 2);
  } finally {
    await cleanupMeetup(meetupId, [host.id, joinerA.id, joinerB.id]);
  }
});

run('닫힌 모임은 예정 시간이 남아도 참가할 수 없다', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const users = await pool.query(
    'INSERT INTO users (nickname) VALUES ($1), ($2) RETURNING id',
    [`closed-host-${suffix}`, `closed-joiner-${suffix}`],
  );
  const [host, joiner] = users.rows;
  const meetupResult = await pool.query(
    `
      INSERT INTO meetups (host_id, title, location, scheduled_at, capacity, status)
      VALUES ($1, $2, $3, now() + interval '2 hours', 5, 'closed')
      RETURNING id
    `,
    [host.id, `closed-${suffix}`, 'test cafe'],
  );
  const meetupId = meetupResult.rows[0].id;

  try {
    const service = createMeetupService({ db });
    await assert.rejects(
      () => service.joinMeetup({ meetupId, userId: joiner.id }),
      (error) => error.code === 'MEETUP_CLOSED',
    );
  } finally {
    await cleanupMeetup(meetupId, [host.id, joiner.id]);
  }
});

run('somoim_state는 기본이 none이고 setSomoimState로 바뀐다', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const userResult = await pool.query(
    `INSERT INTO users (nickname) VALUES ($1) RETURNING id`,
    [`somoim-state-${suffix}`],
  );
  const hostId = userResult.rows[0].id;

  const created = await queries.createMeetup({
    hostId,
    title: `somoim-state-${suffix}`,
    description: null,
    location: 'test cafe',
    scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    capacity: 4,
  });

  try {
    assert.equal(created.somoimState, 'none', '기본값은 자동화 대상 아님이다');

    const updated = await queries.setSomoimState({
      meetupId: created.id,
      state: 'pending',
      jobId: null,
    });
    assert.equal(updated.somoimState, 'pending');

    const fetched = await queries.getMeetupById(created.id);
    assert.equal(fetched.somoimState, 'pending');

    const listed = await queries.listMeetups(hostId);
    const row = listed.find((item) => item.id === created.id);
    assert.equal(row.somoimState, 'pending', '목록에도 상태가 실려야 화면이 배지를 그린다');
  } finally {
    await pool.query('DELETE FROM participants WHERE meetup_id = $1', [created.id]);
    await pool.query('DELETE FROM meetups WHERE id = $1', [created.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
  }
});
