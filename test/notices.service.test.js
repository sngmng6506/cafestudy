import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNoticesService } from '../src/features/notices/notices.service.js';

function stubDb(rows = []) {
  const calls = [];
  return {
    calls,
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows, rowCount: rows.length };
      },
    },
  };
}

test('notice summary polling returns a bounded page and prioritizes recent notices', async () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({ id: index + 1 }));
  const { db, calls } = stubDb(rows);
  const service = createNoticesService({ db });

  const page = await service.listPage('user-1', { limit: 8, offset: 0, summary: true });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['user-1', true, 9, 0]);
  assert.match(calls[0].sql, /left\(n\.body, 240\)/);
  assert.match(calls[0].sql, /CASE WHEN \$2::boolean THEN false ELSE n\.is_pinned END/);
  assert.match(calls[0].sql, /LIMIT \$3 OFFSET \$4/);
  assert.equal(page.items.length, 8);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, 8);
});

test('notice page rejects invalid limits and offsets before querying the database', () => {
  const { db, calls } = stubDb();
  const service = createNoticesService({ db });

  assert.throws(
    () => service.listPage('user-1', { limit: 500, summary: true }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.throws(
    () => service.listPage('user-1', { limit: 20, offset: -1 }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(calls.length, 0);
});
