const DEFAULT_POLL_INTERVAL_MS = 5_000;

export function createWorkerConfig(env = process.env) {
  const serverUrl = (env.CAFESTUDY_SERVER_URL ?? '').trim().replace(/\/+$/, '');
  const internalApiKey = (env.INTERNAL_API_KEY ?? '').trim();

  if (!serverUrl) throw new Error('CAFESTUDY_SERVER_URL is required');
  if (!internalApiKey) throw new Error('INTERNAL_API_KEY is required');

  return {
    serverUrl,
    internalApiKey,
    // 서버의 SOMOIM_AUTOMATION_ALLOW_SUBMIT과 별개인 worker 로컬 스위치다.
    // 둘 다 true여야 실제 제출이 가능하다.
    allowSubmit: env.ALLOW_SOMOIM_SUBMIT === 'true',
    pollIntervalMs: readPositiveInt(env.POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    adbPath: (env.ADB_PATH ?? 'adb').trim() || 'adb',
    adbSerial: (env.ADB_SERIAL ?? '').trim(),
    artifactDir: (env.ARTIFACT_DIR ?? './worker-artifacts').trim() || './worker-artifacts',
  };
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
