import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanAdbHosts, subnetOf } from '../worker/host-scan.js';

describe('subnetOf', () => {
  it('IPv4에서 /24 대역을 뽑는다', () => {
    assert.equal(subnetOf('192.168.200.155'), '192.168.200.');
    assert.equal(subnetOf(' 10.0.0.7 '), '10.0.0.');
  });

  it('IP가 아니면 빈 문자열을 준다', () => {
    // 대역을 모르면 훑을 범위가 없다. 추측하지 않는다.
    for (const value of ['', 'tablet.local', '192.168.200', '999.1.1.1', undefined]) {
      assert.equal(subnetOf(value), '', `${value}는 대역이 없다`);
    }
  });
});

describe('scanAdbHosts', () => {
  const probeFor = (openHosts) => async (host) => openHosts.includes(host);

  it('대역에서 adb 포트가 열린 호스트만 돌려준다', async () => {
    const found = await scanAdbHosts({
      subnet: '192.168.200.', port: 5555, probe: probeFor(['192.168.200.155', '192.168.200.20']),
    });
    assert.deepEqual(found, ['192.168.200.20', '192.168.200.155'], '마지막 옥텟 오름차순');
  });

  it('원래 주소가 살아 있으면 먼저 확인한다', async () => {
    // 대개 그대로다. 바뀐 경우에만 나머지를 본다.
    const found = await scanAdbHosts({
      subnet: '192.168.200.', port: 5555, preferHost: '192.168.200.155',
      probe: probeFor(['192.168.200.20', '192.168.200.155']),
    });
    assert.equal(found[0], '192.168.200.155');
  });

  it('대역이나 포트가 없으면 훑지 않는다', async () => {
    const never = () => assert.fail('probe를 부르면 안 된다');
    assert.deepEqual(await scanAdbHosts({ subnet: '', port: 5555, probe: never }), []);
    assert.deepEqual(await scanAdbHosts({ subnet: '10.0.0.', port: 0, probe: never }), []);
  });

  it('예산이 지나면 찾은 것까지만 돌려준다', async () => {
    // job이 이미 늦어진 상황에서 도는 마지막 수단이다. 무한정 붙잡지 않는다.
    let clock = 0;
    const found = await scanAdbHosts({
      subnet: '10.0.0.', port: 5555, budgetMs: 5, concurrency: 1,
      now: () => (clock += 1),
      probe: async (host) => host === '10.0.0.1',
    });
    assert.deepEqual(found, ['10.0.0.1']);
  });

  it('254개를 모두 훑는다', async () => {
    const seen = [];
    await scanAdbHosts({
      subnet: '10.0.0.', port: 5555,
      probe: async (host) => { seen.push(host); return false; },
    });
    assert.equal(seen.length, 254);
    assert.ok(seen.includes('10.0.0.1') && seen.includes('10.0.0.254'));
  });
});
