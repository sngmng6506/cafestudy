import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAdb,
  parseDeviceList,
  parseMdnsServices,
  parseWirelessHost,
  selectDevice,
} from '../worker/adb.js';

const DEVICE_LIST = `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
R52N20ABCDE            device product:gta8wifi model:SM_X200 device:gta8wifi transport_id:1
`;

test('parseDeviceList: ignores daemon notices and the header line', () => {
  assert.deepEqual(parseDeviceList(DEVICE_LIST), [
    { serial: 'R52N20ABCDE', state: 'device' },
  ]);
});

test('parseDeviceList: reads wireless serials and non-ready states', () => {
  const stdout = `List of devices attached
192.168.0.15:37000     device
R52N20ABCDE            unauthorized
`;
  assert.deepEqual(parseDeviceList(stdout), [
    { serial: '192.168.0.15:37000', state: 'device' },
    { serial: 'R52N20ABCDE', state: 'unauthorized' },
  ]);
});

test('parseDeviceList: returns an empty list when nothing is attached', () => {
  assert.deepEqual(parseDeviceList('List of devices attached\n\n'), []);
});

// 회귀 방지: mDNS로 붙은 기기는 시리얼에 공백이 들어 있다. 공백으로 자르면
// state 자리에 `._tcp`가 들어가 멀쩡한 기기를 이상한 상태로 오판했다.
test('parseDeviceList: keeps mDNS serials that contain spaces intact', () => {
  const stdout = `List of devices attached
adb-HA2DPWL2-4QfPSa (2)._adb-tls-connect._tcp device product:TB335FC_PRC model:TB335FC device:TB335FC transport_id:1
`;
  assert.deepEqual(parseDeviceList(stdout), [
    { serial: 'adb-HA2DPWL2-4QfPSa (2)._adb-tls-connect._tcp', state: 'device' },
  ]);
});

test('selectDevice: accepts a device reached over mDNS', () => {
  const stdout = `List of devices attached
adb-HA2DPWL2-4QfPSa._adb-tls-connect._tcp device product:TB335FC_PRC transport_id:1
`;
  assert.equal(selectDevice(parseDeviceList(stdout)), 'adb-HA2DPWL2-4QfPSa._adb-tls-connect._tcp');
});

test('parseDeviceList: reads multi-word states without eating the serial', () => {
  const stdout = `List of devices attached
1234567890 no permissions (user in plugdev group; are your udev rules wrong?)
`;
  assert.deepEqual(parseDeviceList(stdout), [
    { serial: '1234567890', state: 'no permissions (user in plugdev group; are your udev rules wrong?)' },
  ]);
});

test('parseDeviceList: skips lines that are not device entries', () => {
  assert.deepEqual(parseDeviceList('adb server version (41) doesn\'t match\n'), []);
});

test('selectDevice: picks the only ready device', () => {
  assert.equal(selectDevice([{ serial: 'R52N20ABCDE', state: 'device' }]), 'R52N20ABCDE');
});

test('selectDevice: needs manual review when no device is attached', () => {
  assert.throws(() => selectDevice([]), (error) => {
    assert.equal(error.needsManualReview, true);
    assert.match(error.message, /No Android device/);
    return true;
  });
});

test('selectDevice: needs manual review when the device is unauthorized', () => {
  assert.throws(() => selectDevice([{ serial: 'R52N20ABCDE', state: 'unauthorized' }]), (error) => {
    assert.equal(error.needsManualReview, true);
    assert.match(error.message, /unauthorized/);
    return true;
  });
});

test('selectDevice: refuses to guess between multiple devices', () => {
  const devices = [
    { serial: 'R52N20ABCDE', state: 'device' },
    { serial: '192.168.0.15:37000', state: 'device' },
  ];
  assert.throws(() => selectDevice(devices), (error) => {
    assert.equal(error.needsManualReview, true);
    assert.match(error.message, /found 2/);
    return true;
  });
});

test('selectDevice: honours a preferred serial when several are attached', () => {
  const devices = [
    { serial: 'R52N20ABCDE', state: 'device' },
    { serial: '192.168.0.15:37000', state: 'device' },
  ];
  assert.equal(selectDevice(devices, { preferredSerial: '192.168.0.15:37000' }), '192.168.0.15:37000');
});

test('selectDevice: fails when the preferred serial is missing or not ready', () => {
  assert.throws(
    () => selectDevice([{ serial: 'R52N20ABCDE', state: 'device' }], { preferredSerial: 'other' }),
    /not connected/,
  );
  assert.throws(
    () => selectDevice([{ serial: 'other', state: 'offline' }], { preferredSerial: 'other' }),
    /offline/,
  );
});

const MDNS_OUTPUT = `List of discovered mdns services
adb-TB335FC-xYzAbC	_adb-tls-pairing._tcp	192.168.200.147:33333
adb-TB335FC-xYzAbC	_adb-tls-connect._tcp	192.168.200.147:41273
`;

test('parseMdnsServices: keeps only wireless debugging connect addresses', () => {
  assert.deepEqual(parseMdnsServices(MDNS_OUTPUT), ['192.168.200.147:41273']);
});

test('parseMdnsServices: returns an empty list when nothing is discovered', () => {
  assert.deepEqual(parseMdnsServices('List of discovered mdns services\n'), []);
  assert.deepEqual(parseMdnsServices(''), []);
});

// 각 adb 호출에 무엇을 돌려줄지 정해 두는 가짜 exec. 호출 순서를 그대로 기록한다.
// scanPorts는 기본이 스텁이다 — 실제 스캐너가 붙으면 테스트가 네트워크를 훑는다.
function fakeAdb({
  devices = [],
  mdns = '',
  onConnect = () => {},
  mdnsSupported = true,
  openPorts = [],
  ...options
} = {}) {
  const calls = [];
  const queue = Array.isArray(devices[0]) ? [...devices] : [devices];

  const adb = createAdb({
    ...options,
    scanPorts: async ({ host }) => {
      calls.push(`scan ${host}`);
      return openPorts;
    },
    exec: async (_path, args) => {
      calls.push(args.join(' '));
      if (args[0] === 'devices') {
        const current = queue.length > 1 ? queue.shift() : queue[0];
        const lines = current.map((device) => `${device.serial}\t${device.state}`).join('\n');
        return { stdout: `List of devices attached\n${lines}\n` };
      }
      if (args[0] === 'mdns') {
        if (!mdnsSupported) throw new Error('unknown command');
        return { stdout: mdns };
      }
      if (args[0] === 'connect') {
        return { stdout: onConnect(args[1]) ?? `connected to ${args[1]}\n` };
      }
      return { stdout: '' };
    },
  });

  return { adb, calls };
}

test('resolveDevice: does not reconnect while the device is already there', async () => {
  const { adb, calls } = fakeAdb({ devices: [{ serial: 'R52N20ABCDE', state: 'device' }] });

  assert.equal(await adb.resolveDevice(), 'R52N20ABCDE');
  assert.deepEqual(calls, ['devices -l'], '멀쩡한 연결에 adb connect를 쏘면 연결이 끊긴다');
});

test('resolveDevice: reconnects to the configured address and retries', async () => {
  const { adb, calls } = fakeAdb({
    connectAddress: '192.168.200.147:5555',
    devices: [[], [{ serial: '192.168.200.147:5555', state: 'device' }]],
  });

  assert.equal(await adb.resolveDevice(), '192.168.200.147:5555');
  assert.deepEqual(calls, ['devices -l', 'connect 192.168.200.147:5555', 'devices -l']);
});

test('resolveDevice: falls back to the mDNS address when no address is configured', async () => {
  const { adb, calls } = fakeAdb({
    mdns: MDNS_OUTPUT,
    devices: [[], [{ serial: '192.168.200.147:41273', state: 'device' }]],
  });

  assert.equal(await adb.resolveDevice(), '192.168.200.147:41273');
  assert.ok(calls.includes('connect 192.168.200.147:41273'), '포트가 바뀌어도 mDNS로 찾아 붙어야 한다');
});

test('resolveDevice: does not connect to the same address twice', async () => {
  // 고정 주소가 mDNS 목록에도 그대로 나오는 상황. 실패해도 한 번만 시도해야 한다.
  const { adb, calls } = fakeAdb({
    connectAddress: '192.168.200.147:41273',
    mdns: MDNS_OUTPUT,
    devices: [[], []],
    onConnect: (address) => `failed to connect to ${address}\n`,
  });

  await assert.rejects(() => adb.resolveDevice(), /No Android device/);
  assert.deepEqual(calls.filter((call) => call.startsWith('connect')), [
    'connect 192.168.200.147:41273',
  ]);
});

test('resolveDevice: moves on to mDNS when the fixed address is dead', async () => {
  const { adb, calls } = fakeAdb({
    connectAddress: '192.168.200.147:5555',
    mdns: MDNS_OUTPUT,
    devices: [[], [{ serial: '192.168.200.147:41273', state: 'device' }]],
    // adb는 연결에 실패해도 exit 0으로 끝나는 경우가 있다.
    onConnect: (address) => `failed to connect to ${address}\n`,
  });

  assert.equal(await adb.resolveDevice(), '192.168.200.147:41273');
  assert.deepEqual(calls.filter((call) => call.startsWith('connect')), [
    'connect 192.168.200.147:5555',
    'connect 192.168.200.147:41273',
  ]);
});

test('resolveDevice: still needs manual review when reconnecting fails', async () => {
  const { adb } = fakeAdb({
    connectAddress: '192.168.200.147:5555',
    devices: [[], []],
    onConnect: () => {
      throw new Error('failed to connect');
    },
  });

  await assert.rejects(() => adb.resolveDevice(), (error) => {
    assert.equal(error.needsManualReview, true);
    assert.match(error.message, /No Android device/);
    return true;
  });
});

test('resolveDevice: survives an adb build without mDNS support', async () => {
  const { adb, calls } = fakeAdb({ devices: [[], []], mdnsSupported: false });

  await assert.rejects(() => adb.resolveDevice(), /No Android device/);
  assert.deepEqual(calls, ['devices -l', 'mdns services'], '후보가 없으면 재조회하지 않는다');
});

test('resolveDevice: an unauthorized device is reported, not reconnected around', async () => {
  const { adb } = fakeAdb({
    connectAddress: '192.168.200.147:5555',
    devices: [[{ serial: 'R52N20ABCDE', state: 'unauthorized' }]],
  });

  await assert.rejects(() => adb.resolveDevice(), /unauthorized/);
});

test('selectDevice: accepts the same tablet on a different port', () => {
  // 태블릿이 재부팅되면 무선 디버깅이 랜덤 포트로 다시 뜬다. 설정에 적힌 포트가
  // 아니라고 사람을 부르면 자동 복구가 되지 않는다.
  const devices = [{ serial: '192.168.200.147:41887', state: 'device' }];

  assert.equal(
    selectDevice(devices, { preferredSerial: '192.168.200.147:5555' }),
    '192.168.200.147:41887',
  );
});

test('selectDevice: prefers a live transport over a stale one on the same tablet', () => {
  // `adb tcpip` 뒤에는 옛 주소가 offline으로 남는다. 쓸 수 있는 쪽을 골라야 한다.
  const devices = [
    { serial: '192.168.200.147:5555', state: 'offline' },
    { serial: '192.168.200.147:41887', state: 'device' },
  ];

  assert.equal(
    selectDevice(devices, { preferredSerial: '192.168.200.147:5555' }),
    '192.168.200.147:41887',
  );
});

test('selectDevice: a different tablet on the network is not accepted', () => {
  assert.throws(
    () => selectDevice(
      [{ serial: '192.168.200.9:5555', state: 'device' }],
      { preferredSerial: '192.168.200.147:5555' },
    ),
    /not connected/,
  );
});

test('selectDevice: a USB serial still has to match exactly', () => {
  assert.throws(
    () => selectDevice(
      [{ serial: 'R52N20OTHER', state: 'device' }],
      { preferredSerial: 'R52N20ABCDE' },
    ),
    /not connected/,
  );
});

test('parseWirelessHost: reads the host of a wireless address only', () => {
  assert.equal(parseWirelessHost('192.168.200.147:5555'), '192.168.200.147');
  assert.equal(parseWirelessHost('R52N20ABCDE'), '');
  assert.equal(parseWirelessHost(''), '');
});

test('resolveDevice: scans the tablet ports when the address and mDNS both fail', async () => {
  const { adb, calls } = fakeAdb({
    connectAddress: '192.168.200.147:5555',
    serial: '192.168.200.147:5555',
    mdnsSupported: false,
    openPorts: [5555, 41887],
    devices: [[], [{ serial: '192.168.200.147:41887', state: 'device' }]],
    onConnect: (address) => (address.endsWith(':41887')
      ? `connected to ${address}\n`
      : `failed to connect to ${address}\n`),
  });

  assert.equal(await adb.resolveDevice(), '192.168.200.147:41887');
  assert.ok(calls.includes('scan 192.168.200.147'), '스캔까지 가야 랜덤 포트를 찾는다');
  assert.deepEqual(calls.filter((call) => call.startsWith('connect')), [
    // 고정 주소는 이미 시도했으므로 스캔 결과에서 다시 쏘지 않는다.
    'connect 192.168.200.147:5555',
    'connect 192.168.200.147:41887',
  ]);
});

test('resolveDevice: does not scan when the fixed address works', async () => {
  const { adb, calls } = fakeAdb({
    connectAddress: '192.168.200.147:5555',
    devices: [[], [{ serial: '192.168.200.147:5555', state: 'device' }]],
  });

  assert.equal(await adb.resolveDevice(), '192.168.200.147:5555');
  assert.ok(!calls.some((call) => call.startsWith('scan')), '앞이 성공하면 몇 초를 더 쓰지 않는다');
});

test('resolveDevice: does not scan for a USB serial', async () => {
  // USB 시리얼에는 훑을 IP가 없다. 엉뚱한 호스트를 스캔하지 않아야 한다.
  const { adb, calls } = fakeAdb({ serial: 'R52N20ABCDE', devices: [[], []] });

  await assert.rejects(() => adb.resolveDevice(), /not connected/);
  assert.ok(!calls.some((call) => call.startsWith('scan')));
});

// 고정 주소·mDNS·포트 스캔은 모두 기기의 IP를 안다고 전제한다. 주소가 바뀌면 셋 다
// 빗나가므로 같은 대역을 훑는다. 실제로 .147 → .155로 바뀌어 워커가 사흘 동안
// 기기를 못 찾은 적이 있다.
const LOST = '192.168.200.147:5555';

function adbForLostHost({ serials = {}, hosts = [], devices = '' } = {}) {
  const calls = [];
  const exec = async (_path, args) => {
    calls.push(args.join(' '));
    const [first, second] = args;
    if (first === 'devices') return { stdout: devices };
    // 옛 주소는 더 이상 이 기기가 아니다. 붙지 않아야 대역 스캔까지 간다.
    if (first === 'connect') {
      return { stdout: second === LOST ? 'failed to connect' : `connected to ${second}` };
    }
    if (first === '-s' && args[2] === 'shell') {
      const found = serials[second];
      if (!found) throw new Error('offline');
      return { stdout: `${found}\n` };
    }
    return { stdout: '' };
  };
  return {
    calls,
    adb: createAdb({
      serial: LOST, connectAddress: LOST, deviceSerialNo: 'HA2DPWL2', exec,
      scanPorts: async () => [],
      scanHosts: async () => hosts,
    }),
  };
}

test('IP가 바뀌면 대역을 훑어 시리얼이 맞는 기기에 붙는다', async () => {
  const { adb, calls } = adbForLostHost({
    hosts: ['192.168.200.155'], serials: { '192.168.200.155:5555': 'HA2DPWL2' },
  });
  const attempted = await adb.reconnect();
  assert.ok(attempted.includes('192.168.200.155:5555'));
  assert.ok(!calls.some((c) => c.startsWith('disconnect')), '맞는 기기는 끊지 않는다');
});

test('시리얼이 다른 기기에는 붙어 있지 않는다', async () => {
  // 대역에는 남의 안드로이드도 있다. adb 목록에 남겨두면 selectDevice가 헷갈린다.
  const { adb, calls } = adbForLostHost({
    hosts: ['192.168.200.30'], serials: { '192.168.200.30:5555': 'SOMEONEELSE' },
  });
  await adb.reconnect();
  assert.ok(calls.includes('disconnect 192.168.200.30:5555'), '남의 기기는 즉시 끊는다');
});

test('시리얼을 모르면 대역을 훑지 않는다', async () => {
  // 찾아낸 기기가 우리 것인지 확인할 방법이 없다. 못 붙는 편이 낫다.
  let scanned = false;
  const adb = createAdb({
    serial: LOST, connectAddress: LOST, deviceSerialNo: '',
    exec: async (_p, args) => ({ stdout: args[0] === 'connect' ? 'failed' : '' }),
    scanPorts: async () => [],
    scanHosts: async () => { scanned = true; return ['192.168.200.155']; },
  });
  await adb.reconnect();
  assert.equal(scanned, false);
});

test('찾아낸 새 주소로 기기를 고른다', async () => {
  // 설정의 옛 주소로 고르면 방금 붙여 놓고도 못 찾는다.
  const { adb } = adbForLostHost({
    hosts: ['192.168.200.155'], serials: { '192.168.200.155:5555': 'HA2DPWL2' },
    devices: 'List of devices attached\n192.168.200.155:5555\tdevice\n',
  });
  assert.equal(await adb.resolveDevice(), '192.168.200.155:5555');
});
