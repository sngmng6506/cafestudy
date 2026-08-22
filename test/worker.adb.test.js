import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDeviceList, selectDevice } from '../worker/adb.js';

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
