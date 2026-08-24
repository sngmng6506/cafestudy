import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdb, parseDeviceList, parseMdnsServices, selectDevice } from '../worker/adb.js';

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
function fakeAdb({ devices = [], mdns = '', onConnect = () => {}, mdnsSupported = true, ...options } = {}) {
  const calls = [];
  const queue = Array.isArray(devices[0]) ? [...devices] : [devices];

  const adb = createAdb({
    ...options,
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
