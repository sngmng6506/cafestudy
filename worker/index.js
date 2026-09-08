import { createAdb } from './adb.js';
import { createApiClient } from './api-client.js';
import { createWorkerConfig } from './config.js';
import { createDeviceWatch, formatDowntime } from './device-watch.js';
import { createDeviceNotifier, createDiscordNotifier } from './discord-notifier.js';
import { createCreateMeetupHandler } from './handlers/create-meetup.js';
import { createDeleteMeetupHandler } from './handlers/delete-meetup.js';
import { runJob } from './job-runner.js';
import { DEFAULT_LOCK_FILE, acquireWorkerLock } from './lock.js';
import {
  createWorkerLogger,
  normalizeJobFailure,
  normalizeWorkerFailure,
} from './observability.js';

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
const log = createWorkerLogger();
const notifyDiscord = createDiscordNotifier({
  webhookUrl: config.discordWebhookUrl,
  timeoutMs: config.discordAlertTimeoutMs,
});
const notifyDeviceEvent = createDeviceNotifier({
  webhookUrl: config.discordWebhookUrl,
  timeoutMs: config.discordAlertTimeoutMs,
});
const deviceWatch = createDeviceWatch({ intervalMs: config.deviceCheckIntervalMs });
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick() {
  const job = await client.claimJob();
  if (!job) return false;

  log('info', 'job_claimed', { jobId: job.id, jobType: job.type, attempt: job.attempts });
  if (job.type === 'create_meetup') {
    const preflight = await client.preflightJob(job.id);
    if (preflight?.action !== 'proceed') {
      log('info', 'job_skipped', { jobId: job.id, reason: preflight?.action ?? 'unknown' });
      return true;
    }
  }
  const outcome = await runJob({
    job,
    handlers,
    allowSubmit: config.allowSubmit,
    resolveDevice: () => adb.resolveDevice(),
    onBeforeSubmit: (id) => client.markSubmitAttempted(id),
  });

  if (outcome.outcome === 'complete') {
    await client.completeJob(job.id, outcome.result);
    log('info', 'job_succeeded', { jobId: job.id, mode: outcome.result?.mode });
    return true;
  }

  const reportedJob = await client.failJob(job.id, {
    errorMessage: outcome.errorMessage,
    needsManualReview: outcome.needsManualReview,
    result: outcome.result,
  });
  const failure = normalizeJobFailure({ job, outcome, reportedJob });
  log(failure.retryable ? 'warn' : 'error', 'job_failed', failure);
  if (!failure.retryable) await notifySafely(failure);
  return true;
}

async function notifySafely(failure) {
  try {
    const result = await notifyDiscord(failure);
    if (result.sent) log('info', 'discord_alert_sent', {
      jobId: failure.jobId,
      errorCode: failure.errorCode,
    });
  } catch (error) {
    log('warn', 'discord_alert_failed', {
      jobId: failure.jobId,
      errorCode: failure.errorCode,
      message: error?.message || 'Unknown Discord webhook error',
    });
  }
}

// 기기 상태를 확인하고 **상태가 바뀌었을 때만** 알린다. resolveDevice가 재연결까지
// 시도하므로, 스스로 다시 붙은 경우에는 알림이 나가지 않는다 — 사람을 부르는 것은
// worker가 혼자 회복하지 못했을 때뿐이다.
async function checkDevice() {
  let result;
  try {
    result = { online: true, deviceId: await adb.resolveDevice() };
  } catch (error) {
    result = { online: false, message: error?.message ?? 'unknown error' };
  }

  const event = deviceWatch.record(result);
  if (result.online) {
    log('info', 'device_ready', { deviceId: result.deviceId });
  } else {
    log('warn', 'device_unavailable', { message: result.message });
  }
  if (!event) return;

  log('info', event.type, {
    ...(event.deviceId ? { deviceId: event.deviceId } : {}),
    ...(event.downtimeMs === null || event.downtimeMs === undefined
      ? {}
      : { downtimeMs: event.downtimeMs }),
  });
  try {
    const sent = await notifyDeviceEvent({ ...event, downtime: formatDowntime(event.downtimeMs) });
    if (sent.sent) log('info', 'discord_alert_sent', { event: event.type });
  } catch (error) {
    // 알림 실패가 worker를 멈추지 않는다. job 실패 알림과 같은 정책이다.
    log('warn', 'discord_alert_failed', {
      event: event.type,
      message: error?.message || 'Unknown Discord webhook error',
    });
  }
}

async function main() {
  const lockFile = config.lockFile || DEFAULT_LOCK_FILE;
  // 기기는 한 대뿐이라 소비자도 한 명이어야 한다. 두 번째 worker는 여기서 멈춘다.
  const releaseLock = await acquireWorkerLock({ lockFile });

  log('info', 'worker_started', {
    serverUrl: config.serverUrl,
    allowSubmit: config.allowSubmit,
    pollIntervalMs: config.pollIntervalMs,
    lockFile,
  });

  // 시작할 때 기기 상태를 한 번 확인한다. 없으면 재연결까지 시도하므로,
  // 태블릿이 절전에서 깬 뒤 worker만 다시 켜도 대개 여기서 붙는다.
  // 기기가 없어도 시작은 한다 — job은 claim 시점에 다시 확인한다.
  await checkDevice();

  while (running) {
    try {
      const handled = await tick();
      // job을 처리했으면 큐가 비어 있을 때까지 쉬지 않고 이어서 가져온다.
      if (handled) continue;
      // 한가할 때만 기기를 살핀다. job 사이에 끼어들면 재연결 스캔이 처리를 늦춘다.
      if (deviceWatch.due()) await checkDevice();
      await sleep(config.pollIntervalMs);
    } catch (error) {
      // 서버 통신 실패는 job 상태를 바꾸지 않는다. claim한 job이 있었다면
      // claimed로 남으므로 사람이 확인해야 한다.
      log('error', 'worker_error', normalizeWorkerFailure('worker_error', error));
      await sleep(config.pollIntervalMs);
    }
  }

  await releaseLock();
  log('info', 'worker_stopped');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('info', 'worker_stopping', { signal });
    running = false;
  });
}

try {
  await main();
} catch (error) {
  // 락을 못 잡은 경우가 여기로 온다. 두 번째 worker가 조용히 큐를 나눠 갖는 것보다
  // 시끄럽게 죽는 편이 낫다.
  const failure = normalizeWorkerFailure('worker_start_failed', error);
  log('error', 'worker_start_failed', failure);
  await notifySafely(failure);
  process.exitCode = 1;
}
