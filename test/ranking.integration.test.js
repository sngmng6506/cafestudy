import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDb } from '../src/core/db.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const BOB = 'aaaaaaaa-0000-0000-0000-000000000002';
const CAROL = 'aaaaaaaa-0000-0000-0000-000000000003';
const TEST_IDS = [ALICE, BOB, CAROL];

let db;
let server;
let baseUrl;

before(async () => {
  if (!hasDb) return;

  db = createDb({ connectionString: process.env.DATABASE_URL });
  await cleanup();
  await seed();

  const allow = (_req, _res, next) => next();
  const app = await createApp({
    db,
    auth: {
      requireUser: allow,
      requireAdmin: allow,
      requireOwner: allow,
    },
    storage: { createDownloadUrl: async (objectKey) => `signed:${objectKey}` },
    config: { env: 'test' },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!hasDb) return;

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await cleanup();
  await db.close();
});

async function cleanup() {
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [TEST_IDS]);
}

async function seed() {
  await db.query(
    `
      INSERT INTO users (id, nickname, total_points) VALUES
        ($1, '__itest_alice', 10000001),
        ($2, '__itest_bob',   10000003),
        ($3, '__itest_carol', 10000002)
    `,
    TEST_IDS,
  );

  await db.query(
    `
      INSERT INTO point_logs (user_id, source, ref_id, amount, created_at) VALUES
        ($1, 'verify', gen_random_uuid(), 10000000, now()),
        ($1, 'verify', gen_random_uuid(),      100, now()),
        ($2, 'verify', gen_random_uuid(), 10000200, now()),
        ($2, 'verify', gen_random_uuid(),  5000000, now() - interval '40 days'),
        ($3, 'verify', gen_random_uuid(), 10000050, now()),
        ($3, 'dice',   gen_random_uuid(), 99999999, now())
    `,
    TEST_IDS,
  );
}

function onlyTestUsers(rows) {
  return rows.filter((row) => TEST_IDS.includes(row.id));
}

test('GET /api/ranking/all-time ranks by verify points only (dice excluded)', { skip: !hasDb }, async () => {
  const res = await fetch(`${baseUrl}/api/ranking/all-time`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.error, null);

  const seeded = onlyTestUsers(body.data);
  assert.equal(seeded.length, 3, 'all three seeded users should appear');
  assert.deepEqual(
    seeded.map((user) => user.nickname),
    ['__itest_bob', '__itest_alice', '__itest_carol'],
  );
  assert.deepEqual(
    seeded.map((user) => user.points),
    [15000200, 10000100, 10000050],
  );

  for (const row of seeded) {
    assert.equal(typeof row.rank, 'number');
  }
});

test('GET /api/ranking/monthly sums current-month point_logs only', { skip: !hasDb }, async () => {
  const res = await fetch(`${baseUrl}/api/ranking/monthly`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.error, null);

  const seeded = onlyTestUsers(body.data);
  assert.equal(seeded.length, 3, 'all three seeded users should appear');
  assert.deepEqual(
    seeded.map((user) => user.nickname),
    ['__itest_bob', '__itest_alice', '__itest_carol'],
  );
  assert.deepEqual(
    seeded.map((user) => user.points),
    [10000200, 10000100, 10000050],
  );
});
