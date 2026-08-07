import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { createDb } from '../src/core/db.js';
import { createMeetupService } from '../src/features/meetups/meetup.service.js';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const run = connectionString ? test : test.skip;
let pool;
let db;

before(() => {
  if (!connectionString) return;
  pool = new Pool({ connectionString });
  db = createDb({ connectionString });
});

after(async () => {
  await db?.close();
  await pool?.end();
});

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

  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
    [host.id, joinerA.id, joinerB.id],
  ]);
});

run('닫힌 모임은 예정 시간이 남아도 참가할 수 없다', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const users = await pool.query(
    `INSERT INTO users (nickname) VALUES ($1), ($2) RETURNING id`,
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

  const service = createMeetupService({ db });
  await assert.rejects(
    () => service.joinMeetup({ meetupId, userId: joiner.id }),
    (error) => error.code === 'MEETUP_CLOSED',
  );

  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[host.id, joiner.id]]);
});
