import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  const app = await createApp({
    db: {
      query() {
        throw new Error('database should not be called by health check');
      },
    },
    auth: {
      requireUser(_req, _res, next) {
        next();
      },
    },
    config: { env: 'test' },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

test('GET /health returns the shared API response shape', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    data: { status: 'ok' },
    error: null,
  });
});

test('GET / returns basic API metadata', async () => {
  const response = await fetch(`${baseUrl}/`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.error, null);
  assert.equal(body.data.name, 'cafestudy API');
  assert.equal(body.data.endpoints.health, '/health');
  assert.equal(body.data.endpoints.meetups, '/api/meetups');
});
