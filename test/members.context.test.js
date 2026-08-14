import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import membersFeature from '../src/features/members/index.js';

function trackingContext() {
  const calls = [];
  return {
    calls,
    ctx: {
      config: { env: 'test', members: {} },
      db: {
        async query(sql) {
          calls.push(sql);
          return { rows: [] };
        },
      },
    },
  };
}

test('members services are isolated by application context', async (t) => {
  const first = trackingContext();
  const second = trackingContext();

  membersFeature.createRoutes(first.ctx);
  const secondRouter = membersFeature.createRoutes(second.ctx);
  const app = express();
  app.use('/api/members', secondRouter);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/members`);
  assert.equal(response.status, 200);
  assert.equal(first.calls.length, 0);
  assert.equal(second.calls.length, 1);
});
