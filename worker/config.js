const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_DEVICE_CHECK_INTERVAL_MS = 10 * 60_000;

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
    // DHCP가 태블릿에 다른 IP를 주면 고정 주소·mDNS·포트 스캔이 모두 빗나간다.
    // 셋 다 기기의 IP를 이미 안다고 전제하기 때문이다. 이 값이 있으면 같은 대역을
    // 훑어 `ro.serialno`가 일치하는 기기를 찾아낸다. 비우면 대역 스캔을 하지 않는다
    // — 시리얼을 모르면 찾은 기기가 우리 태블릿인지 확인할 수 없고, 남의 기기에
    // 붙는 편이 못 붙는 것보다 나쁘다. `adb shell getprop ro.serialno`로 확인한다.
    adbDeviceSerialNo: (env.ADB_DEVICE_SERIALNO ?? '').trim(),
    artifactDir: (env.ARTIFACT_DIR ?? './worker-artifacts').trim() || './worker-artifacts',
    // 클럽 이름은 화면에서 정확히 일치 비교한다. 클럽장이 이름을 바꾸면 코드 수정
    // 없이 여기서 맞춰줄 수 있어야 한다. 비우면 handler의 기본값을 쓴다.
    targetGroupName: (env.SOMOIM_TARGET_GROUP_NAME ?? '').trim(),
    // 정모 사진으로 쓸 이미지. 앱이 사진 없이는 제출을 받지 않는다.
    // 비우면 worker가 단색 16:9 플레이스홀더를 만들어 쓴다.
    meetupPhotoPath: (env.MEETUP_PHOTO_PATH ?? '').trim(),
    // 정모 생성 시 클럽 전원 알림. 기본은 꺼짐이다 — 자동 등록은 아무도 지켜보지
    // 않는 시각에 돌고, 실패해서 다시 시도하면 그만큼 알림이 반복된다. 멤버 124명에게
    // 가는 알림은 되돌릴 수 없으니 켤 때만 명시적으로 켠다.
    notifyMembers: env.SOMOIM_NOTIFY_MEMBERS === 'true',
    // worker 두 개가 같은 태블릿을 동시에 조작하는 것을 막는 락 파일.
    lockFile: (env.WORKER_LOCK_FILE ?? '').trim(),
    discordWebhookUrl: (env.DISCORD_AUTOMATION_WEBHOOK_URL ?? '').trim(),
    // 기기 상태를 확인하는 간격. 기기가 없을 때는 재연결(포트 스캔 포함)까지
    // 시도하므로 폴링 간격만큼 자주 돌리지 않는다.
    deviceCheckIntervalMs: readPositiveInt(
      env.DEVICE_CHECK_INTERVAL_MS,
      DEFAULT_DEVICE_CHECK_INTERVAL_MS,
    ),
    discordAlertTimeoutMs: readPositiveInt(env.DISCORD_ALERT_TIMEOUT_MS, 5_000),
  };
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
