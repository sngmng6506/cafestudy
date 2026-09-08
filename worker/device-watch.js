// 태블릿이 사라진 것을 job이 실패할 때가 아니라 사라진 시점에 알기 위한 감시기다.
//
// worker는 기기가 없어도 조용히 폴링을 계속한다. 그래서 태블릿이 절전에서 못 깨거나
// 재부팅으로 무선 디버깅이 꺼져 있으면, 아무도 모르는 채로 있다가 정모 등록 시각에
// job이 needs_manual_review로 죽는다. 그때는 이미 늦다.
//
// 알림은 상태가 바뀔 때만 보낸다. 폴링마다 보내면 알림이 무의미해지고, 한 번만
// 보내면 복구된 사실을 모른다.

export const DEFAULT_CHECK_INTERVAL_MS = 10 * 60_000;

const UNKNOWN = 'unknown';
const ONLINE = 'online';
const OFFLINE = 'offline';

export function createDeviceWatch({
  intervalMs = DEFAULT_CHECK_INTERVAL_MS,
  now = () => Date.now(),
} = {}) {
  let state = UNKNOWN;
  let checkedAt = null;
  let offlineSince = null;

  return {
    get state() {
      return state;
    },

    // 마지막 확인에서 간격이 지났는지. 첫 호출은 항상 true다 — worker가 뜬 직후
    // 기기가 없으면 그것부터 알려야 한다.
    due(at = now()) {
      return checkedAt === null || at - checkedAt >= intervalMs;
    },

    /**
     * 확인 결과를 반영하고, 알릴 만한 전이가 있으면 이벤트를 돌려준다.
     * 상태가 그대로면 `null`이다.
     */
    record({ online, deviceId = null, message = '' } = {}, at = now()) {
      checkedAt = at;
      const previous = state;
      state = online ? ONLINE : OFFLINE;

      if (previous === state) return null;

      if (state === OFFLINE) {
        offlineSince = at;
        return {
          type: 'device_lost',
          // 시작하자마자 없는 것과, 잘 있다가 사라진 것은 사람이 할 일이 다르다.
          firstCheck: previous === UNKNOWN,
          message: message || 'Android device is not connected',
          at,
        };
      }

      // 처음 확인에서 정상인 것은 평범한 상태다. 알리지 않는다.
      if (previous === UNKNOWN) {
        offlineSince = null;
        return null;
      }

      const downtimeMs = offlineSince === null ? null : at - offlineSince;
      offlineSince = null;
      return { type: 'device_recovered', deviceId, downtimeMs, at };
    },
  };
}

export function formatDowntime(downtimeMs) {
  if (downtimeMs === null || downtimeMs === undefined) return null;
  // round를 쓰면 30초가 '1분'이 된다. 아직 1분이 안 된 것은 그렇게 말해야 한다.
  const minutes = Math.floor(downtimeMs / 60_000);
  if (minutes < 1) return '1분 미만';
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}
