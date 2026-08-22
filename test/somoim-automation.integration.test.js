import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { createDb } from '../src/core/db.js';
import { createSomoimAutomationQueries } from '../src/features/somoim-automation/somoim-automation.queries.js';

// DATABASE_URL이 있을 때만 돈다(CI는 전용 Postgres를 띄운다).
// 테스트가 만든 행만 지우고 다른 행은 건드리지 않는다. requeueStaleJobs는 설계상
// 테이블 전체를 훑으므로, 단언은 항상 이 테스트가 만든 id에 대해서만 한다.
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const run = connectionString ? test : test.skip;
const EXHAUSTED_MESSAGE = 'Worker stopped responding before reporting a result';
let pool;
let db;
let queries;

before(() => {
  if (!connectionString) return;
  pool = new Pool({ connectionString });
  db = createDb({ connectionString });
  queries = createSomoimAutomationQueries(db);
});

after(async () => {
  await db?.close();
  await pool?.end();
});

async function insertJob({
  status = 'pending',
  attempts = 0,
  claimedAt = null,
  createdAt = null,
  title = 'job',
}) {
  const result = await pool.query(
    `INSERT INTO somoim_automation_jobs (requested_by, type, payload, status, attempts, claimed_at, created_at)
     VALUES (NULL, 'create_meetup', $1, $2, $3, $4, COALESCE($5, now()))
     RETURNING id`,
    [
      JSON.stringify({ title, dryRun: true, submit: false }),
      status,
      attempts,
      claimedAt,
      createdAt,
    ],
  );
  return result.rows[0].id;
}

async function readJob(id) {
  const result = await pool.query(
    `SELECT status, attempts, claimed_at AS "claimedAt", completed_at AS "completedAt",
            error_message AS "errorMessage"
       FROM somoim_automation_jobs WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

async function cleanup(ids) {
  await pool.query('DELETE FROM somoim_automation_jobs WHERE id = ANY($1::uuid[])', [ids]);
}

run('listJobs filters by status and returns the newest job first', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const olderId = await insertJob({
    status: 'succeeded',
    title: `older-${suffix}`,
    createdAt: new Date(Date.now() - 60_000),
  });
  const newerId = await insertJob({ status: 'succeeded', title: `newer-${suffix}` });
  const otherId = await insertJob({ status: 'pending', title: `other-${suffix}` });

  try {
    const succeeded = await queries.listJobs({ statuses: ['succeeded'], limit: 100, offset: 0 });
    const ids = succeeded.map((job) => job.id);

    assert.ok(succeeded.every((job) => job.status === 'succeeded'), 'the filter must exclude other statuses');
    assert.ok(ids.includes(newerId) && ids.includes(olderId));
    assert.ok(!ids.includes(otherId), 'a pending job must not appear under a succeeded filter');
    assert.ok(
      ids.indexOf(newerId) < ids.indexOf(olderId),
      'created_at DESC must put the newer job first',
    );
  } finally {
    await cleanup([olderId, newerId, otherId]);
  }
});

run('listJobs accepts several statuses and a null filter means every status', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const pendingId = await insertJob({ status: 'pending', title: `p-${suffix}` });
  const claimedId = await insertJob({ status: 'claimed', title: `c-${suffix}`, claimedAt: new Date() });
  const doneId = await insertJob({ status: 'succeeded', title: `s-${suffix}` });

  try {
    const running = await queries.listJobs({ statuses: ['pending', 'claimed'], limit: 100, offset: 0 });
    const runningIds = running.map((job) => job.id);
    assert.ok(runningIds.includes(pendingId) && runningIds.includes(claimedId));
    assert.ok(!runningIds.includes(doneId));

    const all = await queries.listJobs({ statuses: null, limit: 100, offset: 0 });
    const allIds = all.map((job) => job.id);
    for (const id of [pendingId, claimedId, doneId]) {
      assert.ok(allIds.includes(id), 'a null status filter must not exclude anything');
    }
  } finally {
    await cleanup([pendingId, claimedId, doneId]);
  }
});

run('listJobs never returns more rows than the limit and honours the offset', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const ids = [];
  for (let index = 0; index < 3; index += 1) {
    ids.push(await insertJob({ status: 'failed', title: `limit-${suffix}-${index}` }));
  }

  try {
    const firstPage = await queries.listJobs({ statuses: ['failed'], limit: 2, offset: 0 });
    assert.equal(firstPage.length, 2);

    const secondPage = await queries.listJobs({ statuses: ['failed'], limit: 2, offset: 2 });
    const overlap = secondPage.filter((job) => firstPage.some((first) => first.id === job.id));
    assert.deepEqual(overlap, [], 'paging must not repeat a row across pages');

    assert.ok(firstPage[0].payload?.title, 'payload must come back parsed for the admin list');
  } finally {
    await cleanup(ids);
  }
});

run('requeueStaleJobs returns a stale claim to pending while attempts remain', async () => {
  const staleId = await insertJob({
    status: 'claimed',
    attempts: 1,
    claimedAt: new Date(Date.now() - 3_600_000),
  });

  try {
    const recovered = await queries.requeueStaleJobs({
      staleAfterSeconds: 60,
      maxAttempts: 3,
      exhaustedMessage: EXHAUSTED_MESSAGE,
    });
    assert.ok(recovered.some((row) => row.id === staleId));

    const job = await readJob(staleId);
    assert.equal(job.status, 'pending');
    assert.equal(job.claimedAt, null, 'a requeued job must not keep its old claim time');
    assert.equal(job.attempts, 1, 'the attempt budget must survive the requeue');
  } finally {
    await cleanup([staleId]);
  }
});

run('requeueStaleJobs hands a job to a human once attempts run out', async () => {
  const exhaustedId = await insertJob({
    status: 'claimed',
    attempts: 3,
    claimedAt: new Date(Date.now() - 3_600_000),
  });

  try {
    await queries.requeueStaleJobs({
      staleAfterSeconds: 60,
      maxAttempts: 3,
      exhaustedMessage: EXHAUSTED_MESSAGE,
    });

    const job = await readJob(exhaustedId);
    assert.equal(job.status, 'needs_manual_review');
    assert.equal(job.errorMessage, EXHAUSTED_MESSAGE);
    assert.ok(job.completedAt, 'an exhausted job must be closed out');
  } finally {
    await cleanup([exhaustedId]);
  }
});

run('requeueStaleJobs leaves a job that is still within its claim window', async () => {
  const freshId = await insertJob({ status: 'claimed', attempts: 1, claimedAt: new Date() });

  try {
    await queries.requeueStaleJobs({
      staleAfterSeconds: 900,
      maxAttempts: 3,
      exhaustedMessage: EXHAUSTED_MESSAGE,
    });

    const job = await readJob(freshId);
    assert.equal(job.status, 'claimed', 'a running worker must not have its job taken away');
    assert.ok(job.claimedAt);
  } finally {
    await cleanup([freshId]);
  }
});

run('requeueStaleJobs never revives a job whose result was already reported', async () => {
  const longAgo = new Date(Date.now() - 3_600_000);
  const succeededId = await insertJob({ status: 'succeeded', attempts: 1, claimedAt: longAgo });
  const failedId = await insertJob({ status: 'failed', attempts: 1, claimedAt: longAgo });
  const reviewId = await insertJob({ status: 'needs_manual_review', attempts: 1, claimedAt: longAgo });
  const pendingId = await insertJob({ status: 'pending', attempts: 1 });

  try {
    await queries.requeueStaleJobs({
      staleAfterSeconds: 60,
      maxAttempts: 3,
      exhaustedMessage: EXHAUSTED_MESSAGE,
    });

    assert.equal((await readJob(succeededId)).status, 'succeeded');
    assert.equal((await readJob(failedId)).status, 'failed');
    assert.equal((await readJob(reviewId)).status, 'needs_manual_review');
    assert.equal((await readJob(pendingId)).status, 'pending');
  } finally {
    await cleanup([succeededId, failedId, reviewId, pendingId]);
  }
});

run('claimNextJob takes the oldest pending job and counts the attempt', async () => {
  // 다른 행보다 확실히 오래된 시각을 써서 이 테스트가 만든 job이 먼저 잡히게 한다.
  const oldestId = await insertJob({
    status: 'pending',
    createdAt: new Date('2000-01-01T00:00:00Z'),
  });
  const newerId = await insertJob({
    status: 'pending',
    createdAt: new Date('2000-01-02T00:00:00Z'),
  });

  try {
    const claimed = await queries.claimNextJob();
    assert.equal(claimed.id, oldestId, 'created_at ASC decides who goes first');
    assert.equal(claimed.status, 'claimed');
    assert.equal(claimed.attempts, 1);
    assert.ok(claimed.claimedAt);

    assert.equal((await readJob(newerId)).status, 'pending', 'only one job may be claimed at a time');
  } finally {
    await cleanup([oldestId, newerId]);
  }
});

run('completeJob and failJob only move a job that is currently claimed', async () => {
  const pendingId = await insertJob({ status: 'pending' });

  try {
    assert.equal(await queries.completeJob({ id: pendingId, result: {} }), null);
    assert.equal(
      await queries.failJob({ id: pendingId, errorMessage: 'x', needsManualReview: false, result: {} }),
      null,
    );
    assert.equal((await readJob(pendingId)).status, 'pending');
  } finally {
    await cleanup([pendingId]);
  }
});
