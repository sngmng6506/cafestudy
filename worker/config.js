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
    // 기기가 사라졌을 때 다시 붙일 주소. `adb tcpip 5555`로 고정한 경우에 쓴다.
    // 비워 두면 mDNS 탐색만으로 재연결을 시도한다.
    adbConnectAddress: (env.ADB_CONNECT_ADDRESS ?? '').trim(),
    artifactDir: (env.ARTIFACT_DIR ?? './worker-artifacts').trim() || './worker-artifacts',
    // 클럽 이름은 화면에서 정확히 일치 비교한다. 클럽장이 이름을 바꾸면 코드 수정
    // 없이 여기서 맞춰줄 수 있어야 한다. 비우면 handler의 기본값을 쓴다.
    targetGroupName: (env.SOMOIM_TARGET_GROUP_NAME ?? '').trim(),
    // worker 두 개가 같은 태블릿을 동시에 조작하는 것을 막는 락 파일.
    lockFile: (env.WORKER_LOCK_FILE ?? '').trim(),
  };
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
