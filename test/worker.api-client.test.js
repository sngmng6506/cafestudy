import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '../worker/api-client.js';

const INTERNAL_KEY = 'super-secret-internal-key';

function clientWith(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return responder(url, init);
  };
  return {
    calls,
    client: createApiClient({
      baseUrl: 'https://cafestudy.example.com/',
      internalKey: INTERNAL_KEY,
      fetchImpl,
    }),
  };
}

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('claimJob: sends the internal key and unwraps the job envelope', async () => {
  const job = { id: 'job-1', type: 'create_meetup', payload: { dryRun: true } };
  const { client, calls } = clientWith(() => jsonResponse({ data: { job }, error: null }));

  assert.deepEqual(await client.claimJob(), job);
  assert.equal(calls[0].url, 'https://cafestudy.example.com/api/somoim-automation/jobs/claim');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['x-internal-key'], INTERNAL_KEY);
});

test('claimJob: returns null when the queue is empty', async () => {
  const { client } = clientWith(() => jsonResponse({ data: { job: null }, error: null }));
  assert.equal(await client.claimJob(), null);
});

test('preflightJob: checks cancellation and duplicates before touching the device', async () => {
  const { client, calls } = clientWith(() => jsonResponse({ data: { action: 'proceed' }, error: null }));
  assert.deepEqual(await client.preflightJob('job-1'), { action: 'proceed' });
  assert.equal(calls[0].url, 'https://cafestudy.example.com/api/somoim-automation/jobs/job-1/preflight');
});

test('completeJob: posts the result to the job complete endpoint', async () => {
  const { client, calls } = clientWith(() => jsonResponse({ data: { status: 'succeeded' }, error: null }));
  await client.completeJob('job-1', { mode: 'dryRun', stoppedAt: 'before_submit' });

  assert.equal(calls[0].url, 'https://cafestudy.example.com/api/somoim-automation/jobs/job-1/complete');
  assert.deepEqual(calls[0].body, { result: { mode: 'dryRun', stoppedAt: 'before_submit' } });
});

test('failJob: forwards the manual review flag', async () => {
  const { client, calls } = clientWith(() => jsonResponse({ data: { status: 'needs_manual_review' }, error: null }));
  await client.failJob('job-1', {
    errorMessage: 'Create button was not found',
    needsManualReview: true,
    result: { stage: 'open_create_screen' },
  });

  assert.equal(calls[0].url, 'https://cafestudy.example.com/api/somoim-automation/jobs/job-1/fail');
  assert.deepEqual(calls[0].body, {
    errorMessage: 'Create button was not found',
    needsManualReview: true,
    result: { stage: 'open_create_screen' },
  });
});

test('rejects with the server error code and never leaks the internal key', async () => {
  const { client } = clientWith(() => jsonResponse(
    { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid internal key' } },
    { ok: false, status: 401 },
  ));

  await assert.rejects(() => client.claimJob(), (error) => {
    assert.match(error.message, /UNAUTHORIZED: Invalid internal key/);
    assert.ok(!error.message.includes(INTERNAL_KEY), 'internal key must not appear in errors');
    return true;
  });
});

test('falls back to the status code when the body is not JSON', async () => {
  const { client } = clientWith(() => ({
    ok: false,
    status: 502,
    json: async () => { throw new Error('not json'); },
  }));

  await assert.rejects(() => client.claimJob(), /HTTP_502/);
});
