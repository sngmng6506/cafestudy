import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { acquireWorkerLock, isProcessAlive } from '../worker/lock.js';

async function tempLockFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'worker-lock-test-'));
  return path.join(dir, 'worker.lock');
}

test('acquireWorkerLock: writes the holder pid and releases it', async () => {
  const lockFile = await tempLockFile();

  const release = await acquireWorkerLock({ lockFile, pid: 4242 });
  assert.equal(await readFile(lockFile, 'utf8'), '4242');

  await release();
  await assert.rejects(() => readFile(lockFile, 'utf8'), { code: 'ENOENT' });
});

test('acquireWorkerLock: a second live worker is refused', async () => {
  const lockFile = await tempLockFile();
  await acquireWorkerLock({ lockFile, pid: 111, isAlive: () => true });

  await assert.rejects(
    () => acquireWorkerLock({ lockFile, pid: 222, isAlive: () => true }),
    /Another worker is already running \(pid 111/,
  );
});

// 크래시 뒤 재기동이 막히면 무인 운영이 안 된다. 죽은 프로세스의 락은 회수한다.
test('acquireWorkerLock: reclaims a lock left by a dead process', async () => {
  const lockFile = await tempLockFile();
  await writeFile(lockFile, '999999');

  const release = await acquireWorkerLock({ lockFile, pid: 222, isAlive: () => false });

  assert.equal(await readFile(lockFile, 'utf8'), '222');
  await release();
});

test('acquireWorkerLock: release does not delete a lock that was reclaimed by someone else', async () => {
  const lockFile = await tempLockFile();
  const release = await acquireWorkerLock({ lockFile, pid: 111, isAlive: () => false });

  // 다른 worker가 이 락을 회수해 자기 pid를 적은 상황을 흉내낸다.
  await writeFile(lockFile, '222');
  await release();

  assert.equal(await readFile(lockFile, 'utf8'), '222', '남의 락을 지우면 안 된다');
});

test('acquireWorkerLock: release is idempotent', async () => {
  const lockFile = await tempLockFile();
  const release = await acquireWorkerLock({ lockFile, pid: 111 });

  await release();
  await release();
});

test('isProcessAlive: this process is alive and a bogus pid is not', () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(Number.NaN), false);
});

test('isProcessAlive: EPERM means the process exists but belongs to someone else', () => {
  const kill = () => {
    const error = new Error('operation not permitted');
    error.code = 'EPERM';
    throw error;
  };
  assert.equal(isProcessAlive(1, kill), true);
});

test('isProcessAlive: ESRCH means the process is gone', () => {
  const kill = () => {
    const error = new Error('no such process');
    error.code = 'ESRCH';
    throw error;
  };
  assert.equal(isProcessAlive(999999, kill), false);
});
