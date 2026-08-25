import { open, readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// worker 인스턴스 상호배제.
//
// job claim은 FOR UPDATE SKIP LOCKED로 job 단위 원자성만 보장한다. worker를 두 개
// 띄우면 서로 다른 job을 각각 claim해서 같은 태블릿 한 대를 동시에 조작한다 —
// 탭이 뒤섞여 화면이 엉망이 된다. 기기는 한 대이므로 소비자도 한 명이어야 한다.
//
// 락 파일에 PID를 적고, 이미 있으면 그 PID가 살아 있는지 확인한다. 죽은 프로세스가
// 남긴 락은 회수한다(크래시 후 재기동이 막히면 무인 운영이 안 된다).
export const DEFAULT_LOCK_FILE = path.join(os.tmpdir(), 'cafestudy-somoim-worker.lock');

export function isProcessAlive(pid, kill = process.kill.bind(process)) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // 신호 0은 프로세스를 건드리지 않고 존재 여부만 확인한다.
    kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM은 남의 프로세스라 신호를 못 보낸 것 — 살아 있다는 뜻이다.
    return error?.code === 'EPERM';
  }
}

export async function acquireWorkerLock({
  lockFile = DEFAULT_LOCK_FILE,
  pid = process.pid,
  isAlive = isProcessAlive,
} = {}) {
  async function write() {
    // 'wx'는 파일이 이미 있으면 실패한다. 확인과 생성 사이의 경합이 없다.
    const handle = await open(lockFile, 'wx');
    try {
      await handle.writeFile(String(pid));
    } finally {
      await handle.close();
    }
  }

  try {
    await write();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;

    const holder = Number.parseInt(await readFile(lockFile, 'utf8').catch(() => ''), 10);
    if (isAlive(holder)) {
      throw new Error(
        `Another worker is already running (pid ${holder}, lock ${lockFile}). `
          + 'Only one worker may drive the tablet.',
      );
    }

    // 죽은 프로세스가 남긴 락이다. 회수하고 한 번만 다시 시도한다 — 여기서 또
    // EEXIST가 나면 다른 worker가 방금 가져간 것이므로 그대로 실패시킨다.
    await unlink(lockFile).catch(() => {});
    await write();
  }

  let released = false;
  return async function release() {
    if (released) return;
    released = true;
    // 내 락일 때만 지운다. 회수당한 뒤라면 남의 락을 지우면 안 된다.
    const holder = Number.parseInt(await readFile(lockFile, 'utf8').catch(() => ''), 10);
    if (holder === pid) await unlink(lockFile).catch(() => {});
  };
}
