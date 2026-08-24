import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ManualReviewError } from './errors.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15_000;

// 시리얼을 공백으로 자를 수 없다. mDNS로 붙은 기기는 시리얼 자체에 공백이 있다.
//   adb-HA2DPWL2-4QfPSa (2)._adb-tls-connect._tcp device product:TB335FC_PRC ...
// 그래서 state를 알려진 값으로 고정하고, 그 앞을 통째로 시리얼로 읽는다.
// 뒤쪽 `key:value`는 `-l`이 붙이는 부가 정보라 버린다.
const DEVICE_LINE = new RegExp(
  '^(?<serial>.+?)\\s+'
    + '(?<state>device|offline|unauthorized|authorizing|connecting|bootloader'
    + '|recovery|rescue|sideload|host|no permissions.*?)'
    + '(?:\\s+\\w+:\\S+)*$',
);

export function parseDeviceList(stdout = '') {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*') && !line.startsWith('List of devices'))
    .map((line) => DEVICE_LINE.exec(line)?.groups)
    .filter((device) => device?.serial && device.state)
    .map(({ serial, state }) => ({ serial, state }));
}

// `adb mdns services`의 출력에서 무선 디버깅 주소만 골라낸다. 무선 디버깅은
// 서비스가 뜰 때마다 포트가 바뀌어서 고정 주소로는 다시 붙지 못한다.
//   List of discovered mdns services
//   adb-TB335FC-xYzAbC  _adb-tls-connect._tcp  192.168.200.147:41273
export function parseMdnsServices(stdout = '') {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('_adb-tls-connect._tcp'))
    .map((line) => line.split(/\s+/).at(-1))
    .filter((address) => /^[\w.-]+:\d+$/.test(address ?? ''));
}

// 기기를 확정할 수 없으면 추측하지 않고 사람에게 넘긴다.
export function selectDevice(devices = [], { preferredSerial = '' } = {}) {
  if (preferredSerial) {
    const match = devices.find((device) => device.serial === preferredSerial);
    if (!match) {
      throw new ManualReviewError(`Device ${preferredSerial} is not connected`);
    }
    if (match.state !== 'device') {
      throw new ManualReviewError(`Device ${preferredSerial} is ${match.state}`);
    }
    return match.serial;
  }

  const ready = devices.filter((device) => device.state === 'device');
  if (ready.length === 1) return ready[0].serial;
  if (ready.length > 1) {
    throw new ManualReviewError(`Expected exactly one device, found ${ready.length}`);
  }

  const blocked = devices.find((device) => device.state !== 'device');
  if (blocked) {
    throw new ManualReviewError(`Device ${blocked.serial} is ${blocked.state}`);
  }
  throw new ManualReviewError('No Android device is connected');
}

export function createAdb({
  adbPath = 'adb',
  serial = '',
  connectAddress = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  exec = execFileAsync,
} = {}) {
  async function run(args) {
    const { stdout } = await exec(adbPath, args, { timeout: timeoutMs });
    return stdout ?? '';
  }

  async function listDevices() {
    return parseDeviceList(await run(['devices', '-l']));
  }

  // 알려진 주소와 mDNS로 찾은 주소를 차례로 시도한다. 실패는 삼킨다 —
  // 붙었는지는 호출부가 listDevices로 다시 확인한다.
  async function reconnect() {
    const attempted = [];

    // adb connect는 실패해도 exit 0인 빌드가 있어서 출력으로 판단한다.
    // "connected to"는 "already connected to"도 함께 잡는다.
    async function tryAddress(address) {
      if (!address || attempted.includes(address)) return false;
      attempted.push(address);
      try {
        return /connected to/i.test(await run(['connect', address]));
      } catch {
        // 주소가 죽었거나 기기가 응답하지 않는다. 다음 후보로 넘어간다.
        return false;
      }
    }

    if (await tryAddress(connectAddress)) return attempted;

    try {
      for (const address of parseMdnsServices(await run(['mdns', 'services']))) {
        if (await tryAddress(address)) break;
      }
    } catch {
      // mDNS를 지원하지 않는 adb 빌드(데비안 패키지 등)에서는 여기서 끝난다.
    }

    return attempted;
  }

  return {
    listDevices,
    reconnect,

    // 기기가 없으면 한 번 다시 붙여 보고 재확인한다. 태블릿이 절전에 들어갔다
    // 깨어나면 무선 연결이 끊기는데, 그때마다 사람이 adb connect를 해줘야 하면
    // 무인 운영이 되지 않는다.
    async resolveDevice() {
      try {
        return selectDevice(await listDevices(), { preferredSerial: serial });
      } catch (error) {
        const attempted = await reconnect();
        if (attempted.length === 0) throw error;
        return selectDevice(await listDevices(), { preferredSerial: serial });
      }
    },

    async shell(deviceId, args) {
      return run(['-s', deviceId, 'shell', ...args]);
    },

    // 화면 상태를 결과에 남기기 위한 스크린샷. 실패해도 job 자체를 죽이지 않는다.
    async captureScreenshot(deviceId, localPath) {
      const remotePath = '/sdcard/cafestudy-automation.png';
      await run(['-s', deviceId, 'shell', 'screencap', '-p', remotePath]);
      await run(['-s', deviceId, 'pull', remotePath, localPath]);
      await run(['-s', deviceId, 'shell', 'rm', '-f', remotePath]);
      return localPath;
    },

    async dumpUi(deviceId, localPath) {
      const remotePath = '/sdcard/cafestudy-ui.xml';
      await run(['-s', deviceId, 'shell', 'uiautomator', 'dump', remotePath]);
      await run(['-s', deviceId, 'pull', remotePath, localPath]);
      return localPath;
    },
  };
}
