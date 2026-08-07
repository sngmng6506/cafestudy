import assert from 'node:assert/strict';
import test from 'node:test';
import { createShutdownHandler } from '../src/core/shutdown.js';

test('graceful shutdown closes the server and database before exiting', async () => {
  const calls = [];
  const server = {
    close(callback) {
      calls.push('server.close');
      callback();
    },
  };
  const db = {
    async close() {
      calls.push('db.close');
    },
  };
  const logger = {
    info(event) {
      calls.push(event);
    },
    error(event) {
      calls.push(event);
    },
  };
  const exits = [];
  const shutdown = createShutdownHandler({
    server,
    db,
    logger,
    timeoutMs: 100,
    exit(code) {
      exits.push(code);
    },
  });

  await shutdown('SIGTERM');

  assert.deepEqual(calls, [
    'shutdown_started',
    'server.close',
    'db.close',
    'shutdown_completed',
  ]);
  assert.deepEqual(exits, [0]);
});

test('graceful shutdown runs only once', async () => {
  let closeCount = 0;
  const shutdown = createShutdownHandler({
    server: {
      close(callback) {
        closeCount += 1;
        callback();
      },
    },
    db: { close: async () => {} },
    logger: { info() {}, error() {} },
    exit() {},
  });

  await shutdown('SIGTERM');
  await shutdown('SIGINT');

  assert.equal(closeCount, 1);
});
