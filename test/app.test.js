import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
const auth = {
  requireUser(_req, _res, next) {
    next();
  },
  requireAdmin(_req, _res, next) {
    next();
  },
  requireOwner(_req, _res, next) {
    next();
  },
};
const logger = {
  info() {},
  warn() {},
  error() {},
};
const healthyDb = {
  async query(text) {
    assert.equal(text, 'SELECT 1');
    return { rows: [{ '?column?': 1 }] };
  },
};

async function closeServer(instance) {
  await new Promise((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()));
  });
}

before(async () => {
  const app = await createApp({
    db: healthyDb,
    auth,
    logger,
    config: { env: 'test' },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await closeServer(server);
});

test('GET /live checks only process liveness', async () => {
  const response = await fetch(`${baseUrl}/live`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    data: { status: 'ok' },
    error: null,
  });
});

test('GET /health checks database readiness', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    data: { status: 'ok', database: 'ok' },
    error: null,
  });
});

test('GET /health returns 503 without exposing database details', async () => {
  const app = await createApp({
    db: {
      async query() {
        const error = new Error('password authentication failed for internal-db-host');
        error.code = '28P01';
        throw error;
      },
    },
    auth,
    logger,
    config: { env: 'test' },
  });
  const failingServer = app.listen(0);
  await new Promise((resolve) => failingServer.once('listening', resolve));

  try {
    const { port } = failingServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
    assert.equal(JSON.stringify(body).includes('internal-db-host'), false);
  } finally {
    await closeServer(failingServer);
  }
});

test('unexpected errors expose only a request id and generic message', async () => {
  const app = await createApp({
    db: healthyDb,
    auth,
    logger,
    storage: {
      status() {
        throw new Error('secret bucket endpoint: internal-storage-host');
      },
    },
    config: { env: 'test' },
  });
  const failingServer = app.listen(0);
  await new Promise((resolve) => failingServer.once('listening', resolve));

  try {
    const { port } = failingServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/storage/status`, {
      headers: { 'x-request-id': 'internal-error-test' },
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, '서버에서 오류가 발생했습니다.');
    assert.equal(body.error.requestId, 'internal-error-test');
    assert.equal(JSON.stringify(body).includes('internal-storage-host'), false);
  } finally {
    await closeServer(failingServer);
  }
});

test('responses preserve a supplied request id', async () => {
  const response = await fetch(`${baseUrl}/live`, {
    headers: { 'x-request-id': 'test-request-123' },
  });

  assert.equal(response.headers.get('x-request-id'), 'test-request-123');
});

test('GET / returns basic API metadata', async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.error, null);
  assert.equal(body.data.name, 'cafestudy API');
  assert.equal(body.data.endpoints.liveness, '/live');
  assert.equal(body.data.endpoints.health, '/health');
  assert.equal(body.data.endpoints.meetups, '/api/meetups');
});
