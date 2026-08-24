import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createSomoimAutomationRouter } from '../src/features/somoim-automation/somoim-automation.routes.js';

const INTERNAL_KEY = 'internal-key-for-tests';
const JOB_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

function stubService(calls, overrides = {}) {
  return {
    async createMeetupJob(input) { calls.push(['createMeetupJob', input]); return { jobId: JOB_ID }; },
    async listJobs(input) { calls.push(['listJobs', input]); return { items: [], hasMore: false, nextOffset: 0 }; },
    async getJob(id) { calls.push(['getJob', id]); return { id }; },
    async claimNextJob() {
      calls.push(['claimNextJob']);
      return overrides.claimNextJob ?? { job: null, recovered: 0, exhausted: [] };
    },
    async completeJob(input) {
      calls.push(['completeJob', input]);
      return overrides.completeJob ?? { id: input.id };
    },
    async failJob(input) {
      calls.push(['failJob', input]);
      return overrides.failJob ?? { id: input.id };
    },
  };
}

function recordingHooks(emitted) {
  return {
    on() {},
    async emit(event, payload) {
      emitted.push({ event, payload });
      return [];
    },
  };
}

async function harness(t, {
  internalApiKey = INTERNAL_KEY, adminAllowed = true, serviceOverrides = {}, hooks,
} = {}) {
  const calls = [];
  const ctx = {
    db: {},
    config: { somoimAutomation: { internalApiKey, allowSubmit: false } },
    auth: {
      requireAdmin(req, res, next) {
        if (!adminAllowed) {
          return res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'admin only' } });
        }
        req.user = { id: ADMIN_ID };
        return next();
      },
    },
    hooks,
  };

  const app = express();
  app.use(express.json());
  app.use('/api/somoim-automation', createSomoimAutomationRouter(ctx, stubService(calls, serviceOverrides)));
  app.use((err, _req, res, _next) => {
    const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
    res.status(statusCode).json({ data: null, error: { code: err.code ?? 'REQUEST_ERROR', message: err.message } });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const { port } = server.address();
  return {
    calls,
    async request(path, { method = 'GET', headers = {}, body } = {}) {
      const response = await fetch(`http://127.0.0.1:${port}/api/somoim-automation${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

const WORKER_ROUTES = [
  { path: '/jobs/claim', body: undefined },
  { path: `/jobs/${JOB_ID}/complete`, body: { result: {} } },
  { path: `/jobs/${JOB_ID}/fail`, body: { errorMessage: 'boom' } },
];

test('worker routes reject a request without the internal key', async (t) => {
  const { request, calls } = await harness(t);

  for (const route of WORKER_ROUTES) {
    const response = await request(route.path, { method: 'POST', body: route.body });
    assert.equal(response.status, 401, `${route.path} must be unauthorized`);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  }
  assert.deepEqual(calls, [], 'service must not run for unauthenticated worker calls');
});

test('worker routes reject a wrong internal key', async (t) => {
  const { request, calls } = await harness(t);

  for (const route of WORKER_ROUTES) {
    const response = await request(route.path, {
      method: 'POST',
      headers: { 'x-internal-key': 'not-the-key' },
      body: route.body,
    });
    assert.equal(response.status, 401);
  }
  assert.deepEqual(calls, []);
});

test('worker routes fail closed when the server has no internal key configured', async (t) => {
  const { request, calls } = await harness(t, { internalApiKey: '' });

  for (const header of [{}, { 'x-internal-key': '' }, { 'x-internal-key': 'anything' }]) {
    const response = await request('/jobs/claim', { method: 'POST', headers: header });
    assert.equal(response.status, 401, 'an unset key must never authorize a request');
  }
  assert.deepEqual(calls, []);
});

test('worker routes accept the configured internal key', async (t) => {
  const { request, calls } = await harness(t);
  const headers = { 'x-internal-key': INTERNAL_KEY };

  const claim = await request('/jobs/claim', { method: 'POST', headers });
  assert.equal(claim.status, 200);

  await request(`/jobs/${JOB_ID}/complete`, { method: 'POST', headers, body: { result: { mode: 'dryRun' } } });
  await request(`/jobs/${JOB_ID}/fail`, {
    method: 'POST',
    headers,
    body: { errorMessage: 'Create button was not found', needsManualReview: true, result: { stage: 'open' } },
  });

  assert.deepEqual(calls.map(([name]) => name), ['claimNextJob', 'completeJob', 'failJob']);
  assert.deepEqual(calls[1][1], { id: JOB_ID, result: { mode: 'dryRun' } });
  assert.deepEqual(calls[2][1], {
    id: JOB_ID,
    errorMessage: 'Create button was not found',
    needsManualReview: true,
    result: { stage: 'open' },
  });
});

test('admin routes are not reachable with the internal key alone', async (t) => {
  const { request, calls } = await harness(t, { adminAllowed: false });
  const headers = { 'x-internal-key': INTERNAL_KEY };

  for (const [path, method, body] of [
    ['/meetups', 'POST', { title: 'x' }],
    ['/jobs', 'GET', undefined],
    [`/jobs/${JOB_ID}`, 'GET', undefined],
  ]) {
    const response = await request(path, { method, headers, body });
    assert.equal(response.status, 403, `${path} must stay behind requireAdmin`);
  }
  assert.deepEqual(calls, [], 'service must not run for non-admin calls');
});

test('admin routes run for an admin and carry the caller id', async (t) => {
  const { request, calls } = await harness(t);

  const created = await request('/meetups', { method: 'POST', body: { title: 'x' } });
  assert.equal(created.status, 202);
  assert.deepEqual(calls[0], ['createMeetupJob', { requestedBy: ADMIN_ID, input: { title: 'x' } }]);
});

test('job list passes paging and status filters through to the service', async (t) => {
  const { request, calls } = await harness(t);

  const response = await request('/jobs?status=pending,claimed&limit=5&offset=10');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { items: [], hasMore: false, nextOffset: 0 });
  assert.deepEqual(calls[0], ['listJobs', { status: 'pending,claimed', limit: 5, offset: 10 }]);
});

test('job list applies defaults when paging is omitted', async (t) => {
  const { request, calls } = await harness(t);

  await request('/jobs');
  assert.deepEqual(calls[0], ['listJobs', { status: undefined, limit: 20, offset: 0 }]);
});

test('/jobs/:id/complete emits somoimRegistrationSucceeded with the job id', async (t) => {
  const emitted = [];
  const { request } = await harness(t, {
    serviceOverrides: { completeJob: { id: JOB_ID, status: 'succeeded' } },
    hooks: recordingHooks(emitted),
  });
  const headers = { 'x-internal-key': INTERNAL_KEY };

  const response = await request(`/jobs/${JOB_ID}/complete`, { method: 'POST', headers, body: { result: {} } });

  assert.equal(response.status, 200);
  assert.deepEqual(emitted, [{ event: 'somoimRegistrationSucceeded', payload: { jobId: JOB_ID } }]);
});

test('/jobs/:id/fail emits somoimRegistrationFailed only when the job is not requeued', async (t) => {
  const emitted = [];
  const { request } = await harness(t, {
    serviceOverrides: { failJob: { id: JOB_ID, status: 'failed', requeued: false } },
    hooks: recordingHooks(emitted),
  });
  const headers = { 'x-internal-key': INTERNAL_KEY };

  await request(`/jobs/${JOB_ID}/fail`, { method: 'POST', headers, body: { errorMessage: 'boom' } });

  assert.deepEqual(emitted, [{ event: 'somoimRegistrationFailed', payload: { jobId: JOB_ID } }]);
});

test('/jobs/:id/fail does not emit when the job was requeued for another attempt', async (t) => {
  const emitted = [];
  const { request } = await harness(t, {
    serviceOverrides: { failJob: { id: JOB_ID, status: 'pending', requeued: true } },
    hooks: recordingHooks(emitted),
  });
  const headers = { 'x-internal-key': INTERNAL_KEY };

  await request(`/jobs/${JOB_ID}/fail`, { method: 'POST', headers, body: { errorMessage: 'boom' } });

  assert.deepEqual(emitted, [], '아직 재시도 여지가 있으면 모임 쪽에 알리면 안 된다');
});

test('/jobs/claim emits somoimRegistrationFailed for every job exhausted by stale recovery', async (t) => {
  const emitted = [];
  const { request } = await harness(t, {
    serviceOverrides: {
      claimNextJob: {
        job: null,
        recovered: 2,
        exhausted: [
          { id: 'job-a', status: 'needs_manual_review' },
          { id: 'job-b', status: 'needs_manual_review' },
        ],
      },
    },
    hooks: recordingHooks(emitted),
  });
  const headers = { 'x-internal-key': INTERNAL_KEY };

  const response = await request('/jobs/claim', { method: 'POST', headers });

  assert.equal(response.status, 200);
  assert.deepEqual(emitted, [
    { event: 'somoimRegistrationFailed', payload: { jobId: 'job-a' } },
    { event: 'somoimRegistrationFailed', payload: { jobId: 'job-b' } },
  ]);
});

test('/jobs/claim does not emit when nothing was exhausted', async (t) => {
  const emitted = [];
  const { request } = await harness(t, {
    serviceOverrides: { claimNextJob: { job: null, recovered: 0, exhausted: [] } },
    hooks: recordingHooks(emitted),
  });
  const headers = { 'x-internal-key': INTERNAL_KEY };

  await request('/jobs/claim', { method: 'POST', headers });

  assert.deepEqual(emitted, []);
});
