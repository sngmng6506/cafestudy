import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanOpenPorts } from '../worker/port-scan.js';

// 지정한 포트에서만 열린 척하는 가짜 probe. 실제 소켓을 열지 않는다.
function fakeProbe(openPorts, { onProbe } = {}) {
  return async (host, port) => {
    onProbe?.(host, port);
    return openPorts.includes(port);
  };
}

test('scanOpenPorts: returns the open ports in ascending order', async () => {
  const open = await scanOpenPorts({
    host: '192.168.200.147',
    fromPort: 1,
    toPort: 100,
    probe: fakeProbe([41, 7, 88]),
  });

  assert.deepEqual(open, [7, 41, 88]);
});

test('scanOpenPorts: covers every port in the range exactly once', async () => {
  const seen = [];
  await scanOpenPorts({
    host: '192.168.200.147',
    fromPort: 10,
    toPort: 20,
    concurrency: 4,
    probe: fakeProbe([], { onProbe: (_host, port) => seen.push(port) }),
  });

  assert.deepEqual([...seen].sort((a, b) => a - b), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test('scanOpenPorts: probes the host it was given', async () => {
  const hosts = new Set();
  await scanOpenPorts({
    host: '10.0.0.5',
    fromPort: 1,
    toPort: 3,
    probe: fakeProbe([], { onProbe: (host) => hosts.add(host) }),
  });

  assert.deepEqual([...hosts], ['10.0.0.5']);
});

test('scanOpenPorts: gives up on the budget instead of blocking the job forever', async () => {
  // 스캔은 job이 이미 늦어진 상황에서 도는 마지막 수단이다. 네트워크가 전부
  // drop이면 65535 포트를 다 기다리다 job 타임아웃을 먹는다.
  let clock = 0;
  const probed = [];
  const open = await scanOpenPorts({
    host: '192.168.200.147',
    fromPort: 1,
    toPort: 65_535,
    concurrency: 1,
    budgetMs: 30,
    now: () => clock,
    probe: async (_host, port) => {
      probed.push(port);
      clock += 10;
      return port === 2;
    },
  });

  assert.deepEqual(open, [2], '한도에 걸려도 그때까지 찾은 것은 돌려준다');
  assert.ok(probed.length < 10, `한도를 넘겨 계속 훑었다: ${probed.length}개`);
});

test('scanOpenPorts: does nothing without a host', async () => {
  assert.deepEqual(await scanOpenPorts({ host: '' }), []);
});
