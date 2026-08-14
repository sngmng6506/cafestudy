import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createGameStateSaveRequest,
  discardSavedGame,
} from '../client/src/features/game2048/game2048.persistence.js';

test('beforeunload game save request uses fetch keepalive', () => {
  const state = { board: Array(16).fill(0), score: 16 };
  const request = createGameStateSaveRequest(state, { keepalive: true });
  assert.equal(request.keepalive, true);
  assert.equal(request.method, 'PUT');
  assert.deepEqual(JSON.parse(request.body), { state });
});

test('starting a new game resets locally and clears the server save with keepalive', async () => {
  const calls = [];
  await discardSavedGame({
    reset() { calls.push('reset'); },
    async clearSavedState(options) { calls.push(['clear', options]); },
  });
  assert.deepEqual(calls, ['reset', ['clear', { keepalive: true }]]);
});
