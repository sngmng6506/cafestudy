const MAX_DEDUPE_KEYS = 1_000;

export function createDiscordNotifier({ webhookUrl = '', fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  const sent = new Set();

  return async function notifyFailure(failure) {
    if (!webhookUrl) return { sent: false, reason: 'disabled' };

    const key = `${failure.jobId ?? 'worker'}:${failure.errorCode}`;
    if (sent.has(key)) return { sent: false, reason: 'duplicate' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toDiscordPayload(failure)),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);

      sent.add(key);
      if (sent.size > MAX_DEDUPE_KEYS) sent.delete(sent.values().next().value);
      return { sent: true };
    } finally {
      clearTimeout(timeout);
    }
  };
}

// 기기 상태 알림은 job 실패와 성격이 다르다. 중복 제거를 여기서 하지 않는 이유는
// createDeviceWatch가 상태가 바뀔 때만 이벤트를 주기 때문이다 — 전이는 매번 알려야
// 하고, notifyFailure의 영구 dedupe를 쓰면 두 번째 단선이 조용히 삼켜진다.
export function createDeviceNotifier({ webhookUrl = '', fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  return async function notifyDeviceEvent(event) {
    if (!webhookUrl) return { sent: false, reason: 'disabled' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toDevicePayload(event)),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);
      return { sent: true };
    } finally {
      clearTimeout(timeout);
    }
  };
}

// job 실패·기기 알림과 별개로, worker 프로세스가 정상 시작했다는 확인용 알림이다.
// 중복 제거를 하지 않는 이유는 device 알림과 같다 — 매 시작(재부팅, 재시작)마다
// 알려야 하고, 시작 자체는 자주 일어나지 않아 스팸이 될 일이 없다.
export function createStartupNotifier({ webhookUrl = '', fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  return async function notifyStarted(info) {
    if (!webhookUrl) return { sent: false, reason: 'disabled' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toStartupPayload(info)),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);
      return { sent: true };
    } finally {
      clearTimeout(timeout);
    }
  };
}

function toStartupPayload({ serverUrl, allowSubmit, pollIntervalMs }) {
  const fields = [
    ['서버', serverUrl],
    ['allowSubmit', allowSubmit],
    ['pollIntervalMs', pollIntervalMs],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return {
    username: 'CafeStudy 자동화',
    embeds: [{
      title: 'worker 정상 시작됨',
      description: '소모임 자동화 worker가 시작되어 job을 받을 준비가 됐다.',
      color: 0x16a34a,
      fields: fields.map(([name, value]) => ({ name, value: String(value), inline: true })),
      timestamp: new Date().toISOString(),
    }],
  };
}

function toDevicePayload(event) {
  if (event.type === 'device_recovered') {
    const fields = [
      ['기기', event.deviceId],
      ['끊겨 있던 시간', event.downtime],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');

    return {
      username: 'CafeStudy 자동화',
      embeds: [{
        title: '태블릿 다시 연결됨',
        description: 'worker가 기기를 다시 찾았다. 정모 자동 등록이 가능한 상태다.',
        color: 0x16a34a,
        fields: fields.map(([name, value]) => ({ name, value: String(value), inline: true })),
        timestamp: new Date().toISOString(),
      }],
    };
  }

  return {
    username: 'CafeStudy 자동화',
    embeds: [{
      title: event.firstCheck ? '태블릿 없이 worker 시작됨' : '태블릿 연결 끊김',
      description: truncate(event.message || 'Android device is not connected', 1_000),
      color: 0xf59e0b,
      fields: [{
        name: '영향',
        value: '지금 상태로는 정모 자동 등록이 실패한다. 태블릿 전원과 무선 디버깅을 확인한다.',
        inline: false,
      }],
      timestamp: new Date().toISOString(),
    }],
  };
}

function toDiscordPayload(failure) {
  const fields = [
    ['오류 코드', failure.errorCode],
    ['단계', failure.stage],
    ['Job', failure.jobId],
    ['종류', failure.jobType],
    ['시도', failure.attempt],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');

  return {
    username: 'CafeStudy 자동화',
    embeds: [{
      title: '소모임 자동화 최종 실패',
      description: truncate(failure.message || 'Unknown worker error', 1_000),
      color: 0xdc2626,
      fields: fields.map(([name, value]) => ({ name, value: String(value), inline: true })),
      timestamp: new Date().toISOString(),
    }],
  };
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
