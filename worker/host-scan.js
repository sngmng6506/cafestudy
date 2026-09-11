import { probeTcpPort } from './port-scan.js';

// DHCP가 태블릿에 다른 IP를 주면 고정 주소도 mDNS도 포트 스캔도 전부 빗나간다.
// 셋 다 기기의 IP를 이미 안다고 전제하기 때문이다. 실제로 재부팅 한 번에 주소가
// .147에서 .155로 바뀌어 워커가 사흘 동안 기기를 못 찾은 적이 있다.
//
// 그래서 같은 대역을 훑는다. 포트 전체가 아니라 adb 포트 하나만 보므로 254개
// 호스트라도 금방 끝난다 — 닫힌 포트는 LAN에서 즉시 conn-refused로 돌아온다.
const DEFAULT_CONCURRENCY = 128;
// 자고 있는 기기는 첫 패킷이 늦다. 포트 스캔(500ms)보다 넉넉하게 잡는다.
const DEFAULT_PROBE_TIMEOUT_MS = 1_000;
const DEFAULT_BUDGET_MS = 30_000;
const LAST_OCTET_MAX = 254;

// `192.168.200.155` → `192.168.200.`. IPv4 사설 대역이 아니면 빈 문자열을 준다.
// 대역을 모르면 훑을 범위도 없다.
export function subnetOf(host = '') {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host).trim());
  if (!parts) return '';
  const octets = parts.slice(1, 5).map(Number);
  if (octets.some((value) => value > 255)) return '';
  return `${octets[0]}.${octets[1]}.${octets[2]}.`;
}

// 같은 대역에서 adb 포트가 열린 호스트를 돌려준다. 원래 주소를 맨 앞에 둔다 —
// 대개 그대로이고, 아니더라도 한 번 더 확인하는 비용이 작다.
export async function scanAdbHosts({
  subnet,
  port,
  preferHost = '',
  concurrency = DEFAULT_CONCURRENCY,
  probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  probe = probeTcpPort,
  now = () => Date.now(),
} = {}) {
  if (!subnet || !port) return [];

  const deadline = now() + budgetMs;
  const found = [];
  let next = 1;

  async function worker() {
    while (next <= LAST_OCTET_MAX && now() < deadline) {
      const octet = next;
      next += 1;
      const host = `${subnet}${octet}`;
      if (await probe(host, port, probeTimeoutMs)) found.push(host);
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, LAST_OCTET_MAX));
  await Promise.all(Array.from({ length: lanes }, worker));

  found.sort((a, b) => Number(a.split('.')[3]) - Number(b.split('.')[3]));
  // 원래 주소가 살아 있으면 그것부터 확인한다.
  return preferHost && found.includes(preferHost)
    ? [preferHost, ...found.filter((host) => host !== preferHost)]
    : found;
}
