import { createAdb } from './adb.js';
import { createApiClient } from './api-client.js';
import { createWorkerConfig } from './config.js';
import { createCreateMeetupHandler } from './handlers/create-meetup.js';
import { runJob } from './job-runner.js';

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
  create_meetup: createCreateMeetupHandler({ adb, artifactDir: config.artifactDir }),
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
  log('worker_started', {
    serverUrl: config.serverUrl,
    allowSubmit: config.allowSubmit,
    pollIntervalMs: config.pollIntervalMs,
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

  log('worker_stopped');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('worker_stopping', { signal });
    running = false;
  });
}

await main();
