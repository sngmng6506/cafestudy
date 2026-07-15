import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdminRouter } from '../src/features/admin/admin.routes.js';

const nextMiddleware = (_req, _res, next) => next();

test('admin router fails closed when requireOwner is missing', () => {
  assert.throws(
    () => createAdminRouter({
      db: {},
      auth: { requireAdmin: nextMiddleware },
    }),
    /requireOwner/,
  );
});

test('admin router registers when explicit owner middleware is provided', () => {
  const router = createAdminRouter({
    db: {},
    auth: {
      requireAdmin: nextMiddleware,
      requireOwner: nextMiddleware,
    },
  });
  assert.equal(typeof router, 'function');
});
