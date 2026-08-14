import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLatestRequestGuard } from '../client/src/shared/latest-request.js';

test('only the newest ranking request may update the displayed result', () => {
  const guard = createLatestRequestGuard();
  const firstRequest = guard.begin();
  const secondRequest = guard.begin();

  assert.equal(guard.isCurrent(firstRequest), false);
  assert.equal(guard.isCurrent(secondRequest), true);
});
