import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeviceWatch, formatDowntime } from '../worker/device-watch.js';

function watchAt(start = 0, intervalMs = 600_000) {
  let clock = start;
  const watch = createDeviceWatch({ intervalMs, now: () => clock });
  return { watch, advance: (ms) => { clock += ms; }, at: () => clock };
}

test('device-watch: 첫 확인은 바로 하고 그다음은 간격을 지킨다', () => {
  const { watch, advance } = watchAt();

  assert.equal(watch.due(), true, 'worker가 뜬 직후 기기가 없으면 그것부터 알려야 한다');
  watch.record({ online: true });
  assert.equal(watch.due(), false);

  advance(599_999);
  assert.equal(watch.due(), false);
  advance(1);
  assert.equal(watch.due(), true);
});

test('device-watch: 정상이던 기기가 사라지면 한 번 알린다', () => {
  const { watch } = watchAt();
  watch.record({ online: true, deviceId: '192.168.200.147:5555' });

  const event = watch.record({ online: false, message: 'Device ... is not connected' });

  assert.equal(event.type, 'device_lost');
  assert.equal(event.firstCheck, false);
  assert.match(event.message, /not connected/);
});

test('device-watch: 끊긴 상태가 이어지면 다시 알리지 않는다', () => {
  const { watch, advance } = watchAt();
  watch.record({ online: true });
  watch.record({ online: false });

  for (let i = 0; i < 5; i += 1) {
    advance(600_000);
    assert.equal(watch.record({ online: false }), null, '폴링마다 알리면 알림이 무의미해진다');
  }
});

test('device-watch: 복구되면 끊겨 있던 시간과 함께 알린다', () => {
  const { watch, advance } = watchAt();
  watch.record({ online: true });
  watch.record({ online: false });
  advance(3 * 600_000);

  const event = watch.record({ online: true, deviceId: '192.168.200.147:41887' });

  assert.equal(event.type, 'device_recovered');
  assert.equal(event.deviceId, '192.168.200.147:41887');
  assert.equal(event.downtimeMs, 1_800_000);
});

test('device-watch: 시작부터 기기가 없으면 첫 확인임을 표시해 알린다', () => {
  const { watch } = watchAt();

  const event = watch.record({ online: false, message: 'No Android device is connected' });

  assert.equal(event.type, 'device_lost');
  assert.equal(event.firstCheck, true, '켜자마자 없는 것과 쓰다가 끊긴 것은 할 일이 다르다');
});

test('device-watch: 처음부터 정상이면 조용하다', () => {
  const { watch } = watchAt();

  assert.equal(watch.record({ online: true, deviceId: 'R52N20ABCDE' }), null);
  assert.equal(watch.state, 'online');
});

test('device-watch: 끊겼다 붙기를 반복해도 전이마다 알린다', () => {
  const { watch } = watchAt();
  watch.record({ online: true });

  assert.equal(watch.record({ online: false }).type, 'device_lost');
  assert.equal(watch.record({ online: true }).type, 'device_recovered');
  assert.equal(watch.record({ online: false }).type, 'device_lost');
});

test('formatDowntime: 사람이 읽는 길이로 바꾼다', () => {
  assert.equal(formatDowntime(null), null);
  assert.equal(formatDowntime(30_000), '1분 미만');
  assert.equal(formatDowntime(600_000), '10분');
  assert.equal(formatDowntime(3_600_000), '1시간');
  assert.equal(formatDowntime(5_400_000), '1시간 30분');
});
