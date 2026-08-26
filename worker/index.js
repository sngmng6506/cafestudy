import { createAdb } from './adb.js';
import { createApiClient } from './api-client.js';
import { createWorkerConfig } from './config.js';
import { createCreateMeetupHandler } from './handlers/create-meetup.js';
import { createDeleteMeetupHandler } from './handlers/delete-meetup.js';
import { runJob } from './job-runner.js';
import { DEFAULT_LOCK_FILE, acquireWorkerLock } from './lock.js';

const config = createWorkerConfig(process.env);
const client = createApiClient({
  baseUrl: config.serverUrl,
  internalKey: config.internalApiKey,
});
const adb = createAdb({
  adbPath: config.adbPath,
  serial: config.adbSerial,
  connectAddress: config.adbConnectAddress,
});
const handlers = {
  create_meetup: createCreateMeetupHandler({
    adb,
    artifactDir: config.artifactDir,
    ...(config.targetGroupName ? { targetGroupName: config.targetGroupName } : {}),
    photoPath: config.meetupPhotoPath,
    notifyMembers: config.notifyMembers,
  }),
  delete_meetup: createDeleteMeetupHandler({
    adb,
    artifactDir: config.artifactDir,
    ...(config.targetGroupName ? { targetGroupName: config.targetGroupName } : {}),
  }),
};

let running = true;

function log(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick() {
  const job = await client.claimJob();
  if (!job) return false;

  log('job_claimed', { jobId: job.id, type: job.type, attempts: job.attempts });
  const outcome = await runJob({
    job,
    handlers,
    allowSubmit: config.allowSubmit,
    resolveDevice: () => adb.resolveDevice(),
    onBeforeSubmit: (id) => client.markSubmitAttempted(id),
  });

  if (outcome.outcome === 'complete') {
    await client.completeJob(job.id, outcome.result);
    log('job_succeeded', { jobId: job.id, mode: outcome.result?.mode });
    return true;
  }

  await client.failJob(job.id, {
    errorMessage: outcome.errorMessage,
    needsManualReview: outcome.needsManualReview,
    result: outcome.result,
  });
  log('job_failed', {
    jobId: job.id,
    needsManualReview: outcome.needsManualReview,
    errorMessage: outcome.errorMessage,
  });
  return true;
}

async function main() {
  const lockFile = config.lockFile || DEFAULT_LOCK_FILE;
  // 기기는 한 대뿐이라 소비자도 한 명이어야 한다. 두 번째 worker는 여기서 멈춘다.
  const releaseLock = await acquireWorkerLock({ lockFile });

  log('worker_started', {
    serverUrl: config.serverUrl,
    allowSubmit: config.allowSubmit,
    pollIntervalMs: config.pollIntervalMs,
    lockFile,
  });

  // 시작할 때 기기 상태를 한 번 확인한다. 없으면 재연결까지 시도하므로,
  // 태블릿이 절전에서 깬 뒤 worker만 다시 켜도 대개 여기서 붙는다.
  try {
    log('device_ready', { deviceId: await adb.resolveDevice() });
  } catch (error) {
    // 기기가 없어도 시작은 한다. job은 claim 시점에 다시 확인하고,
    // 그때까지 기기가 돌아오면 정상 처리된다.
    log('device_unavailable', { message: error?.message ?? 'unknown error' });
  }

  while (running) {
    try {
      const handled = await tick();
      // job을 처리했으면 큐가 비어 있을 때까지 쉬지 않고 이어서 가져온다.
      if (!handled) await sleep(config.pollIntervalMs);
    } catch (error) {
      // 서버 통신 실패는 job 상태를 바꾸지 않는다. claim한 job이 있었다면
      // claimed로 남으므로 사람이 확인해야 한다.
      log('worker_error', { message: error?.message ?? 'unknown error' });
      await sleep(config.pollIntervalMs);
    }
  }

  await releaseLock();
  log('worker_stopped');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('worker_stopping', { signal });
    running = false;
  });
}

try {
  await main();
} catch (error) {
  // 락을 못 잡은 경우가 여기로 온다. 두 번째 worker가 조용히 큐를 나눠 갖는 것보다
  // 시끄럽게 죽는 편이 낫다.
  log('worker_start_failed', { message: error?.message ?? 'unknown error' });
  process.exitCode = 1;
}
