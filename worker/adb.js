import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ManualReviewError } from './errors.js';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15_000;

export function parseDeviceList(stdout = '') {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*') && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial, state = ''] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.serial && device.state);
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

  return {
    listDevices,

    async resolveDevice() {
      return selectDevice(await listDevices(), { preferredSerial: serial });
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
