import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNoticesService } from '../src/features/notices/notices.service.js';

function stubDb() {
  const calls = [];
  return {
    calls,
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
    },
  };
}

test('notice summary polling requests a bounded recent list', async () => {
  const { db, calls } = stubDb();
  const service = createNoticesService({ db });

  await service.list('user-1', { limit: 8, summary: true });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['user-1', true, 8]);
  assert.match(calls[0].sql, /left\(n\.body, 240\)/);
  assert.match(calls[0].sql, /LIMIT \$3/);
});

test('notice list rejects invalid limits before querying the database', async () => {
  const { db, calls } = stubDb();
  const service = createNoticesService({ db });

  await assert.rejects(
    () => service.list('user-1', { limit: 500, summary: true }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(calls.length, 0);
});
