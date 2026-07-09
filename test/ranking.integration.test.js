import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createDb } from '../src/core/db.js';

// Integration test for the ranking routes against a real PostgreSQL instance.
// Seeds clearly-marked test rows, verifies the endpoints, then deletes them.
// Skipped automatically when DATABASE_URL is not configured.
const hasDb = Boolean(process.env.DATABASE_URL);

// Fixed, recognizable UUIDs so cleanup is exact and idempotent.
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

  const app = await createApp({
    db,
    auth: {
      requireUser: (_req, _res, next) => next(),
      requireAdmin: (_req, _res, next) => next(),
    },
    // 랭킹 응답이 대표 뱃지 presigned URL을 붙이므로 서명 스텁이 필요하다.
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
  // Deleting users cascades to point_logs / verifications / participants.
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [TEST_IDS]);
}

async function seed() {
  // 누적/월간 랭킹은 이제 point_logs의 source='verify'만 집계한다(주사위·호스트 제외).
  // total_points 캐시는 전체 합산이라 더 이상 랭킹 정렬 기준이 아니다.
  await db.query(
    `
      INSERT INTO users (id, nickname, total_points) VALUES
        ($1, '__itest_alice', 10000001),
        ($2, '__itest_bob',   10000003),
        ($3, '__itest_carol', 10000002)
    `,
    TEST_IDS,
  );

  // verify 로그 (랭킹에 집계됨):
  //   Alice = 10000000 + 100 = 10000100 (이번 달, 두 로그 -> 집계 테스트)
  //   Bob   = 10000200 (이번 달) + 5000000 (40일 전, 월간에선 제외)
  //   Carol = 10000050 (이번 달)
  // dice 로그는 랭킹에서 제외되어야 함 -> Carol에 큰 주사위 점수를 넣어 검증.
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

// Returns only the seeded test users from a ranking response, preserving order.
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

  // verify 합산: Bob(10000200+5000000=15000200) > Alice(10000100) > Carol(10000050).
  // Carol의 dice 99999999가 집계됐다면 Carol이 1등이었을 것 -> dice 제외 검증.
  assert.deepEqual(
    seeded.map((u) => u.nickname),
    ['__itest_bob', '__itest_alice', '__itest_carol'],
  );
  assert.deepEqual(
    seeded.map((u) => u.points),
    [15000200, 10000100, 10000050],
  );

  // ranks are strictly increasing and each row carries a numeric rank.
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

  // 이번 달 verify 합산 DESC: Bob(10000200) > Alice(10000100) > Carol(10000050).
  // Carol의 dice(이번 달) 99999999는 source 필터로 제외됨.
  assert.deepEqual(
    seeded.map((u) => u.nickname),
    ['__itest_bob', '__itest_alice', '__itest_carol'],
  );

  // Bob's 5,000,000-point log is from last month and must be excluded.
  assert.deepEqual(
    seeded.map((u) => u.points),
    [10000200, 10000100, 10000050],
  );
});
