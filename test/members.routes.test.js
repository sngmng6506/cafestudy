import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createMembersRouter } from '../src/features/members/members.routes.js';

test('member detail routes reject malformed 36-character UUIDs before querying', async (t) => {
  let queryCalls = 0;
  const service = {
    async getMemberStats() { queryCalls += 1; },
    async getMemberAvatarUrl() { queryCalls += 1; },
  };
  const app = express();
  app.use('/api/members', createMembersRouter({ config: {} }, service));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const { port } = server.address();
  const malformedId = '-'.repeat(36);
  for (const suffix of ['stats', 'avatar']) {
    const response = await fetch(`http://127.0.0.1:${port}/api/members/${malformedId}/${suffix}`);
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
  }
  assert.equal(queryCalls, 0);
});
