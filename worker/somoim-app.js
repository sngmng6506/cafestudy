import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ManualReviewError, TransientError } from './errors.js';
// 화면 파싱·포맷은 순수 모듈이 갖는다. 이 파일은 기기를 만지는 일만 한다.
import {
  ADB_KEYBOARD_IME,
  APP_PACKAGE,
  DEFAULT_TARGET_GROUP_NAME,
  JOINED_SECTION_TITLE,
  MY_GROUPS_TAB,
  buildScreenshotKey,
  findByResourceId,
  findCrashDialogButton,
  joinedGroupsBelow,
  parseUiNodes,
} from './somoim-screen.js';

// 기존 import 경로를 유지한다 — handler들이 이 파일 하나만 보고 있다.
export * from './somoim-screen.js';



// ---- 화면 트리 파싱 (순수 함수, 기기 없이 테스트 가능) ----




// ---- 날짜/시간 변환 (순수 함수) ----









// ---- 기기 조작 (adb 래퍼 위에 얇게) ----

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tap(adb, deviceId, point) {
  await adb.shell(deviceId, ['input', 'tap', String(point.x), String(point.y)]);
}

// adb shell은 여러 argv를 공백으로 이어붙여 원격 셸에 한 줄로 보낸다(로컬 따옴표가
// 보존되지 않는다). 원격 셸이 다시 파싱하도록 명령 전체를 인자 하나로 넘긴다.
function escapeForRemoteDoubleQuotes(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

// 숫자만 있는 값은 ADBKeyBoard를 거치지 않는다. `input text`는 ASCII를 그대로
// 넣을 수 있고, 숫자는 이스케이프할 특수문자도 없다. IME를 안 거치면 그만큼
// 죽을 일도 없다 — 실기기에서 시각을 입력하다 ADBKeyBoard가 죽었고, 그 크래시
// 다이얼로그가 화면을 덮어 이후 job들까지 "홈 화면을 못 찾음"으로 연달아 실패했다.
// 한글은 `input text`로 넣을 수 없으므로 그때만 IME 브로드캐스트를 쓴다.
export async function typeText(adb, deviceId, text) {
  const value = String(text);
  if (/^[0-9]+$/.test(value)) {
    await adb.shell(deviceId, ['input', 'text', value]);
    return;
  }
  const escaped = escapeForRemoteDoubleQuotes(value);
  await adb.shell(deviceId, [`am broadcast -a ADB_INPUT_TEXT --es msg "${escaped}"`]);
}

// 포커스된 입력창을 비운다.
//
// ADBKeyBoard의 ADB_CLEAR_TEXT를 쓰지 않는다. 그쪽이 표준 액션이고 글자 수를 세는
// 것보다 안전해 보이지만, 실기기에서 IME를 반복해서 죽였다:
//
//   Error receiving broadcast Intent { act=ADB_CLEAR_TEXT }
//   NullPointerException: ExtractedText.text is null
//     at AdbIME$AdbReceiver.onReceive(AdbIME.java:157)
//
// ADBKeyBoard가 getExtractedText() 결과를 null 검사 없이 읽는데, 시간 선택기의
// 숫자 입력칸은 ExtractedText를 주지 않아 매번 NPE가 났다. IME가 죽으면 "앱이
// 중지되었습니다" 창이 화면을 덮은 채 남아 이후 job까지 연달아 실패한다.
//
// 끝으로 이동한 뒤 지우는 방식은 IME를 거치지 않는다. currentText를 주면 그 길이만큼,
// 모르면 넉넉히 지운다 — 이미 빈 칸에 DEL을 더 보내도 해가 없다.
export async function clearFocusedField(adb, deviceId, currentText = '') {
  const count = String(currentText ?? '').length + 2;
  await adb.shell(deviceId, ['input', 'keyevent', 'KEYCODE_MOVE_END']);
  // 한 번의 keyevent 호출로 여러 키를 보낸다. DEL을 한 건씩 보내면 왕복이 그만큼 늘어난다.
  await adb.shell(deviceId, ['input', 'keyevent', ...Array(count).fill('KEYCODE_DEL')]);
}

// 키보드를 내린다. IME 창은 uiautomator 덤프에 안 잡히면서 그 아래 버튼의 탭을
// 삼킨다 — 시간 선택기의 OK가 이것 때문에 눌리지 않았다(실기기에서 확인).
// 떠 있을 때만 BACK을 보낸다. 안 떠 있는데 보내면 화면이 뒤로 가버린다.
export async function hideKeyboardIfShown(adb, deviceId) {
  const shown = /mInputShown=true/.test(await adb.shell(deviceId, ['dumpsys', 'input_method']));
  if (!shown) return false;
  await adb.shell(deviceId, ['input', 'keyevent', 'KEYCODE_BACK']);
  await sleep(500);
  return true;
}

export async function readScreen(adb, deviceId, artifactDir) {
  const xml = await adb.dumpUiXml(deviceId);
  // 마지막으로 읽은 화면을 파일로도 남긴다. 실패를 진단할 때 이 파일이 유일한
  // 단서다 — 토스트처럼 덤프에 안 잡히는 것까지는 못 담지만, 어느 화면에서
  // 멈췄는지는 여기서 나온다.
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, 'ui-dump.xml'), xml, 'utf8');
  return parseUiNodes(xml);
}


export async function captureEvidence(adb, deviceId, artifactDir, jobId, name) {
  await mkdir(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, `${name}.png`);
  await adb.captureScreenshot(deviceId, screenshotPath);
  return {
    screenshotKey: buildScreenshotKey(jobId, name),
    screenshotPath,
  };
}

// 기기 타임존이 KST가 아니면 정모가 조용히 다른 절대시각에 만들어진다.
// getprop이 비어 오면(롬 차이) 확인할 수 없는 상태이므로 역시 사람에게 넘긴다.
export async function assertDeviceTimezone(adb, deviceId) {
  const timezone = (await adb.shell(deviceId, ['getprop', 'persist.sys.timezone'])).trim();
  if (timezone !== REQUIRED_TIMEZONE) {
    throw new ManualReviewError(
      `Device timezone must be ${REQUIRED_TIMEZONE} but is "${timezone || 'unknown'}"`,
      { stage: 'validate_device', expected: REQUIRED_TIMEZONE, actual: timezone || null },
    );
  }
}

// ---- 화면 이동 ----

// "내 지역" 확인 화면 처리. 콜드 스타트 직후와 "내모임" 탭 진입 시 둘 다 나타날 수
// 있다(비결정적 — 실기기에서 두 자리 다 확인함). 이미 설정된 값을 그대로 저장해서
// 넘어간다(값을 바꾸지 않는다). 그 뒤로 "직장(활동지역) 설정 권장" 안내가 이어질
// 수 있어 "다음에하기"로 건너뛴다. nodes에 게이트가 없으면 아무것도 하지 않는다.
export async function dismissRegionGateIfPresent(adb, deviceId, artifactDir, nodes) {
  const saveLocationButton = findByResourceId(nodes, 'btn_save_location');
  if (!saveLocationButton) return false;

  await tap(adb, deviceId, saveLocationButton.center);
  await sleep(800);

  const afterSave = await readScreen(adb, deviceId, artifactDir);
  const skipWorkplace = afterSave.find(
    (n) => n.resourceId.endsWith('/button2') && n.text === '다음에하기',
  );
  if (skipWorkplace) {
    await tap(adb, deviceId, skipWorkplace.center);
    await sleep(800);
  }
  return true;
}


async function dismissCrashDialogIfPresent(adb, deviceId, artifactDir) {
  const button = findCrashDialogButton(await readScreen(adb, deviceId, artifactDir));
  if (!button?.center) return false;
  await tap(adb, deviceId, button.center);
  await sleep(800);
  return true;
}

export async function launchApp(adb, deviceId, artifactDir) {
  // 앞선 job이 남긴 크래시 다이얼로그를 먼저 치운다. 이게 떠 있으면 앱을 아무리
  // 다시 띄워도 그 위를 덮고 있어 홈 화면을 영영 읽지 못한다.
  await dismissCrashDialogIfPresent(adb, deviceId, artifactDir);
  await adb.shell(deviceId, ['am', 'force-stop', APP_PACKAGE]);
  await adb.shell(deviceId, ['monkey', '-p', APP_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1']);

  const attempts = 10;
  let dismissedRegionGate = false;
  for (let i = 0; i < attempts; i += 1) {
    // 읽기 전에 자지 않는다. uiautomator dump 자체가 화면이 안정될 때까지 기다리고
    // (실기기에서 2.35초), 그 앞의 sleep은 준비가 이미 끝난 경우에도 그대로 낭비된다.
    // 못 찾았을 때만 아래에서 기다린다.
    const nodes = await readScreen(adb, deviceId, artifactDir);
    if (findByResourceId(nodes, 'search_btn_layout')) return;

    // 실행 도중에도 뜰 수 있다. 덮인 채로 남은 시도를 흘려보내지 않는다.
    const crashButton = findCrashDialogButton(nodes);
    if (crashButton?.center) {
      await tap(adb, deviceId, crashButton.center);
      await sleep(800);
      continue;
    }

    if (!dismissedRegionGate && (await dismissRegionGateIfPresent(adb, deviceId, artifactDir, nodes))) {
      dismissedRegionGate = true;
    }
  }

  if (dismissedRegionGate) {
    // 이미 입력을 시도했는데도 홈에 닿지 못했다 — 애매하니 사람이 봐야 한다.
    throw new ManualReviewError(
      'App did not reach the home screen after dismissing the region-confirmation screen',
      { stage: 'launch' },
    );
  }
  // 아직 아무 입력도 하지 않은 상태의 순수한 앱 실행 지연이므로 TransientError다
  // (SOMOIM_AUTOMATION.md의 needsManualReview 예외 케이스).
  throw new TransientError('App did not reach the home screen before launch timeout', {
    stage: 'launch',
  });
}



export async function openJoinedGroup(adb, deviceId, artifactDir, targetGroupName) {
  let nodes = [];
  let tab;
  // uiautomator는 화면이 정착하기 전에 노드를 통째로 빠뜨린다. 실제로 홈 화면이
  // 다 로드된 덤프에 하단 탭 바가 하나도 없어서 job이 실패한 적이 있다.
  // 여기서 한 번만 읽고 포기하면 그 순간을 그대로 실패로 만든다.
  for (let i = 0; i < 10; i += 1) {
    nodes = await readScreen(adb, deviceId, artifactDir);
    tab = nodes.find((n) => n.resourceId.endsWith('/tab_text') && n.text === MY_GROUPS_TAB);
    if (tab) break;
    await sleep(1000);
  }
  if (!tab) {
    throw new ManualReviewError(`"${MY_GROUPS_TAB}" tab not found on the home screen`, {
      stage: 'open_my_groups',
    });
  }
  await tap(adb, deviceId, tab.center);

  let joined = [];
  let dismissedRegionGate = false;
  for (let i = 0; i < 10; i += 1) {
    nodes = await readScreen(adb, deviceId, artifactDir);
    // "가입한 모임" 헤더가 보여야 내모임 화면이다. 이 확인 없이 name_text를 세면
    // 아직 홈에 있을 때 남의 정모 이름을 가입 모임으로 착각한다.
    const header = nodes.find((n) => n.text === JOINED_SECTION_TITLE);
    if (header) {
      joined = joinedGroupsBelow(nodes, header);
      if (joined.length > 0) break;
    }

    if (!dismissedRegionGate && (await dismissRegionGateIfPresent(adb, deviceId, artifactDir, nodes))) {
      dismissedRegionGate = true;
    }
  }

  if (joined.length === 0) {
    throw new ManualReviewError('No joined group found on the 내모임 screen', {
      stage: 'open_my_groups',
    });
  }

  // 가입 모임이 하나면 모호함이 없다. 여러 개면 추측하지 않고 이름으로 고른다.
  const target = joined.length === 1
    ? joined[0]
    : joined.find((n) => n.text === targetGroupName);
  if (!target) {
    throw new ManualReviewError(
      `Target group "${targetGroupName}" not found among joined groups`,
      { stage: 'open_my_groups', joinedGroups: joined.map((n) => n.text) },
    );
  }

  await tap(adb, deviceId, target.center);
  await sleep(800);
  return target.text;
}

// 찾는 요소가 나올 때까지 아래로 스크롤하며 화면을 다시 읽는다. 정모 개설 폼은
// 가로 화면에서 아래쪽(정모 공지, 저장 버튼)이 잘려 첫 덤프에 잡히지 않는다.
export async function scrollUntilFound(adb, deviceId, artifactDir, idSuffix, attempts = 5) {
  let nodes = await readScreen(adb, deviceId, artifactDir);
  for (let i = 0; i < attempts && !findByResourceId(nodes, idSuffix); i += 1) {
    await adb.shell(deviceId, ['input', 'swipe', '1280', '1300', '1280', '500', '300']);
    await sleep(800);
    nodes = await readScreen(adb, deviceId, artifactDir);
  }
  return nodes;
}
