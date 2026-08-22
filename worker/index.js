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
const adb = createAdb({ adbPath: config.adbPath, serial: config.adbSerial });
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
