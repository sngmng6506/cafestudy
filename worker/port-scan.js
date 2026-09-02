import { createConnection } from 'node:net';

// 무선 디버깅은 켤 때마다 포트가 바뀌고, 태블릿이 재부팅되면 `adb tcpip`으로 고정한
// 포트도 함께 풀린다. 고정 주소와 mDNS가 모두 실패했을 때 기기 IP의 열린 포트를
// 훑어 adbd를 찾아내는 것이 마지막 수단이다.
//
// 닫힌 포트는 LAN에서 즉시 conn-refused로 돌아오기 때문에 전체 대역을 훑어도
// 몇 초면 끝난다. 실측(nmap -p- , 같은 Wi-Fi): 65535 포트 3.4초.
const DEFAULT_FROM_PORT = 1024;
const DEFAULT_TO_PORT = 65_535;
// ulimit -n이 1024인 기계가 흔하다. 그 절반만 써서 EMFILE을 피한다.
const DEFAULT_CONCURRENCY = 400;
// 응답이 없는 포트(방화벽 drop)를 기다리는 시간. 짧게 잡아도 refused는 즉시 오므로
// 열린 포트를 놓치지 않는다.
const DEFAULT_PROBE_TIMEOUT_MS = 500;
// 스캔은 job이 이미 늦어진 상황에서 도는 마지막 수단이다. 전체가 끝나지 않아도
// 이 시간이 지나면 그때까지 찾은 것으로 진행한다.
const DEFAULT_BUDGET_MS = 30_000;

// 포트 하나에 TCP 연결을 시도한다. 연결되면 즉시 끊는다 — adb 핸드셰이크는
// adb connect가 하고, 여기서는 "누가 듣고 있는가"만 본다.
export function probeTcpPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    function finish(open) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

// host의 열린 TCP 포트를 오름차순으로 돌려준다. probe를 주입할 수 있어 실기기 없이
// 테스트할 수 있다.
export async function scanOpenPorts({
  host,
  fromPort = DEFAULT_FROM_PORT,
  toPort = DEFAULT_TO_PORT,
  concurrency = DEFAULT_CONCURRENCY,
  probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  probe = probeTcpPort,
  now = () => Date.now(),
} = {}) {
  if (!host) return [];

  const deadline = now() + budgetMs;
  const open = [];
  let next = fromPort;

  // 워커 하나가 포트를 하나씩 집어 가는 방식이다. 배치로 나누면 느린 포트 하나가
  // 그 배치 전체를 붙잡는다.
  async function worker() {
    while (next <= toPort && now() < deadline) {
      const port = next;
      next += 1;
      if (await probe(host, port, probeTimeoutMs)) open.push(port);
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, toPort - fromPort + 1));
  await Promise.all(Array.from({ length: lanes }, worker));

  return open.sort((a, b) => a - b);
}
