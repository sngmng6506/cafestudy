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
