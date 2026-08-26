import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ManualReviewError, TransientError } from '../errors.js';
import { createSolidPng } from '../placeholder-image.js';
import {
  ADB_KEYBOARD_IME,
  APP_PACKAGE,
  DEFAULT_TARGET_GROUP_NAME,
  assertDeviceTimezone,
  assertScheduledAtIsFuture,
  buildScreenshotKey,
  captureEvidence,
  clearFocusedField,
  findByResourceId,
  formatEnglishHeader,
  formatKoreanDate,
  formatKoreanTime,
  hideKeyboardIfShown,
  launchApp,
  monthsBetween,
  openJoinedGroup,
  parseEnglishHeaderDate,
  readScreen,
  scrollUntilFound,
  sleep,
  tap,
  to12Hour,
  toKstParts,
  typeText,
} from '../somoim-app.js';

export { DEFAULT_TARGET_GROUP_NAME };

// 앱이 정모 사진 없이는 제출을 받지 않는다(실기기 확인). 기기로 밀어 넣을 위치와,
// 폼이 아직 사진을 받지 않았을 때 띄우는 안내 문구다.
const REMOTE_PHOTO_PATH = '/sdcard/Pictures/cafestudy-meetup.png';
const PHOTO_PLACEHOLDER_TEXT = '정모사진을 등록해주세요.';

async function openCreateMeetupForm(adb, deviceId, artifactDir, targetGroupName) {
  let nodes = await readScreen(adb, deviceId, artifactDir);

  // 클럽 페이지는 이 계정이 그 클럽 안에서 마지막으로 보고 있던 탭(게시판의 특정
  // 글 등)으로 열릴 수 있다(실기기에서 확인함) — "홈" 탭이 아니면 정모 만들기
  // 버튼이 없다. 이미 홈이어도 다시 눌러서 해가 없으니 매번 탭한다.
  // 탭 텍스트 자체는 clickable=false다(부모 컨테이너가 탭을 받는다) — 좌표만
  // 맞으면 되므로 text로만 찾는다.
  const homeTab = nodes.find((n) => n.text === '홈');
  if (homeTab) {
    await tap(adb, deviceId, homeTab.center);
    await sleep(600);
    nodes = await readScreen(adb, deviceId, artifactDir);
  }

  // 클럽 이름은 툴바 제목과 본문(name_text) 두 군데에 나오는데, 가로 모드에서는
  // 본문 쪽이 화면 밖으로 밀려 덤프에 없다. 화면 방향에 의존하지 않도록 위치를
  // 따지지 않고 이름이 어디든 있으면 그 클럽으로 본다.
  if (!nodes.some((n) => n.text === targetGroupName)) {
    throw new ManualReviewError('Did not land on the target group page', {
      stage: 'open_group_page',
      expected: targetGroupName,
      // 어느 화면에 있었는지 알 수 있게 눈에 보이는 문구 몇 개를 남긴다.
      onScreen: nodes.filter((n) => n.text).slice(0, 8).map((n) => n.text),
    });
  }

  const createButton = nodes.find(
    (n) => n.resourceId.endsWith('/button2') && n.text === '정모 만들기',
  );
  if (!createButton) {
    throw new ManualReviewError(
      '정모 만들기 button not found — bot may not have staff permissions on this club',
      { stage: 'open_group_page' },
    );
  }
  await tap(adb, deviceId, createButton.center);
  await sleep(800);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const formTitle = nodes.find((n) => n.text === '정모 개설');
  if (!formTitle) {
    throw new ManualReviewError('정모 개설 screen did not open', { stage: 'open_create_form' });
  }
}

function isTimePickerNode(n) {
  return (n.resourceId.endsWith('/toggle_mode') && n.contentDesc.includes('text input'))
    || n.resourceId.endsWith('/hours');
}

// 날짜와 시간은 겉보기엔 독립된 두 필드(date_text/time_text)지만, 실제로는 하나의
// date_time_layout 위젯이다. date_text를 눌러 날짜를 확정(OK)하면 폼으로 돌아가지
// 않고 곧바로 시간 선택기로 넘어간다(라이브 기기에서 직접 확인함). time_text를
// 먼저 누르면 그런 연쇄 없이 시간 선택기만 독립적으로 열린다. 그래서 날짜 확정
// 직후 화면이 폼인지 시간 선택기인지 매번 다시 읽어 분기하고, 절대 추측하지 않는다.
async function setDateAndTime(adb, deviceId, artifactDir, target) {
  // ---- 날짜 ----
  let nodes = await readScreen(adb, deviceId, artifactDir);
  const dateField = findByResourceId(nodes, 'date_text');
  if (!dateField) throw new ManualReviewError('date_text field not found', { stage: 'set_date' });
  await tap(adb, deviceId, dateField.center);
  await sleep(600);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const headerYear = findByResourceId(nodes, 'date_picker_header_year');
  const headerDate = findByResourceId(nodes, 'date_picker_header_date');
  const currentParsed = headerDate && parseEnglishHeaderDate(headerDate.text);
  if (!headerYear || !currentParsed || !Number.isInteger(Number(headerYear.text))) {
    throw new ManualReviewError('Date picker did not open as expected', { stage: 'set_date' });
  }
  const current = { year: Number(headerYear.text), month: currentParsed.month };

  const delta = monthsBetween(current, { year: target.year, month: target.month });
  if (Math.abs(delta) > 24) {
    throw new ManualReviewError(`scheduledAt is more than 24 months from today (delta=${delta})`, {
      stage: 'set_date',
    });
  }
  if (delta !== 0) {
    const stepId = delta > 0 ? 'next' : 'prev';
    const stepButton = nodes.find((n) => n.resourceId.endsWith(`/${stepId}`));
    if (!stepButton) {
      throw new ManualReviewError(`Date picker ${stepId} button not found`, { stage: 'set_date' });
    }
    for (let i = 0; i < Math.abs(delta); i += 1) {
      await tap(adb, deviceId, stepButton.center);
      await sleep(300);
    }
  }

  nodes = await readScreen(adb, deviceId, artifactDir);
  const dayNode = nodes.find((n) => n.className === 'android.view.View' && n.text === String(target.day));
  if (!dayNode) {
    throw new ManualReviewError(`Day ${target.day} not found in the displayed month`, { stage: 'set_date' });
  }
  await tap(adb, deviceId, dayNode.center);
  await sleep(400);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const confirmedYear = findByResourceId(nodes, 'date_picker_header_year');
  const confirmedDate = findByResourceId(nodes, 'date_picker_header_date');
  const expectedHeader = formatEnglishHeader(target);
  if (
    !confirmedYear ||
    !confirmedDate ||
    confirmedYear.text !== expectedHeader.yearText ||
    confirmedDate.text !== expectedHeader.dateText
  ) {
    throw new ManualReviewError('Selected date does not match the target date', {
      stage: 'set_date',
      expected: expectedHeader,
      actual: { year: confirmedYear?.text, date: confirmedDate?.text },
    });
  }

  const dateOkButton = nodes.find((n) => n.resourceId.endsWith('/button1') && n.text === 'OK');
  if (!dateOkButton) throw new ManualReviewError('Date picker OK button not found', { stage: 'set_date' });
  await tap(adb, deviceId, dateOkButton.center);
  await sleep(600);

  // ---- 시간: 날짜 확정 직후 화면이 시간 선택기로 넘어갔는지, 폼으로 돌아왔는지 확인한다 ----
  nodes = await readScreen(adb, deviceId, artifactDir);
  if (!nodes.some(isTimePickerNode)) {
    const dateFieldOnForm = findByResourceId(nodes, 'date_text');
    const expectedKoreanDate = formatKoreanDate(target);
    if (!dateFieldOnForm || dateFieldOnForm.text !== expectedKoreanDate) {
      throw new ManualReviewError('Did not return to the form or the time picker after closing the date picker', {
        stage: 'set_date',
        expected: expectedKoreanDate,
        actual: dateFieldOnForm?.text ?? null,
      });
    }
    const timeField = findByResourceId(nodes, 'time_text');
    if (!timeField) throw new ManualReviewError('time_text field not found', { stage: 'set_time' });
    await tap(adb, deviceId, timeField.center);
    await sleep(600);
    nodes = await readScreen(adb, deviceId, artifactDir);
  }

  const toggle = nodes.find(
    (n) => n.resourceId.endsWith('/toggle_mode') && n.contentDesc.includes('text input'),
  );
  if (!toggle) throw new ManualReviewError('Time picker did not open as expected', { stage: 'set_time' });
  await tap(adb, deviceId, toggle.center);
  await sleep(500);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const hourField = findByResourceId(nodes, 'input_hour');
  const minuteField = findByResourceId(nodes, 'input_minute');
  const ampmSpinner = findByResourceId(nodes, 'am_pm_spinner');
  if (!hourField || !minuteField || !ampmSpinner) {
    throw new ManualReviewError('Time picker text-input fields not found', { stage: 'set_time' });
  }

  const { hour12, period } = to12Hour(target.hour24);

  await tap(adb, deviceId, hourField.center);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, String(hour12));
  await sleep(200);

  // 분 칸으로는 탭이 아니라 TAB 키로 옮긴다. 분 칸을 탭해도 포커스가 시 칸에
  // 그대로 남는 기기가 있어(가로 모드에서 확인), 그러면 분 값이 시 값을 덮어써
  // 00:00이 된다. TAB은 레이아웃과 무관하게 다음 입력칸으로 넘어간다.
  await adb.shell(deviceId, ['input', 'keyevent', 'KEYCODE_TAB']);
  await sleep(300);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, String(target.minute).padStart(2, '0'));
  await sleep(300);

  // 입력이 실제로 들어갔는지 여기서 확인한다. 안 하면 나중에 폼에서
  // "시각이 다르다"로만 드러나 원인을 알기 어렵다.
  nodes = await readScreen(adb, deviceId, artifactDir);
  const typedHour = findByResourceId(nodes, 'input_hour')?.text;
  const typedMinute = findByResourceId(nodes, 'input_minute')?.text;
  if (Number(typedHour) !== hour12 || Number(typedMinute) !== target.minute) {
    throw new ManualReviewError('Typed time did not land in the picker fields', {
      stage: 'set_time',
      expected: { hour: hour12, minute: target.minute },
      actual: { hour: typedHour ?? null, minute: typedMinute ?? null },
    });
  }

  // 입력이 끝났으니 키보드를 내린다. 떠 있으면 아래의 AM/PM 스피너와 OK 탭을
  // 가로채 간다.
  await hideKeyboardIfShown(adb, deviceId);
  nodes = await readScreen(adb, deviceId, artifactDir);

  // AM/PM은 이미 원하는 값이면 건드리지 않는다. 스피너를 열면 드롭다운이 다이얼로그를
  // 덮어 뒤따르는 OK 탭이 드롭다운을 닫는 데 쓰여 버린다(실기기에서 겪음).
  if (findByResourceId(nodes, 'text1')?.text !== period) {
    await tap(adb, deviceId, ampmSpinner.center);
    await sleep(600);

    // 드롭다운이 뜨면 그 안의 항목을 고른다. 애니메이션 중이면 아직 없을 수 있어
    // 매번 화면을 다시 읽는다.
    let chosen = false;
    for (let attempt = 0; attempt < 4 && !chosen; attempt += 1) {
      nodes = await readScreen(adb, deviceId, artifactDir);
      const option = nodes.find((n) => n.resourceId.endsWith('/text1') && n.text === period);
      if (option) {
        await tap(adb, deviceId, option.center);
        await sleep(600);
        nodes = await readScreen(adb, deviceId, artifactDir);
        chosen = findByResourceId(nodes, 'text1')?.text === period;
      } else {
        await sleep(500);
      }
    }
    if (!chosen) {
      throw new ManualReviewError(`Could not set the time picker to ${period}`, {
        stage: 'set_time',
        actual: findByResourceId(nodes, 'text1')?.text ?? null,
      });
    }
  }

  nodes = await readScreen(adb, deviceId, artifactDir);
  const timeOkButton = nodes.find((n) => n.resourceId.endsWith('/button1') && n.text === 'OK');
  if (!timeOkButton) throw new ManualReviewError('Time picker OK button not found', { stage: 'set_time' });
  await tap(adb, deviceId, timeOkButton.center);
  await sleep(500);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const confirmedDateField = findByResourceId(nodes, 'date_text');
  const confirmedTimeField = findByResourceId(nodes, 'time_text');
  const expectedKoreanDate = formatKoreanDate(target);
  const expectedKoreanTime = formatKoreanTime(target);
  if (
    !confirmedDateField ||
    confirmedDateField.text !== expectedKoreanDate ||
    !confirmedTimeField ||
    confirmedTimeField.text !== expectedKoreanTime
  ) {
    throw new ManualReviewError('Did not return to the form with the expected date/time after closing the pickers', {
      stage: 'set_time',
      expected: { date: expectedKoreanDate, time: expectedKoreanTime },
      actual: { date: confirmedDateField?.text ?? null, time: confirmedTimeField?.text ?? null },
    });
  }
}


// "정모 공지(전체 멤버 알림)" 체크박스를 원하는 상태로 맞춘다.
//
// 켜져 있으면 정모를 만들 때 클럽 전원에게 알림이 간다. 기본값은 켜짐이고 그게
// 자동 등록의 목적이지만, 실기기에서 흐름을 시험할 때 실제 멤버에게 알림을 뿌리지
// 않으려면 꺼야 한다. 상태는 check_box의 selected 속성으로 읽는다(체크 시 true).
//
// 가로 화면에서는 이 줄이 폼 아래쪽에 있어 처음 덤프에 안 잡힌다. 보일 때까지
// 스크롤한 뒤 다룬다.
async function setNoticeCheckbox(adb, deviceId, artifactDir, notify) {
  let nodes = await scrollUntilFound(adb, deviceId, artifactDir, 'check_box');

  const checkBox = findByResourceId(nodes, 'check_box');
  if (!checkBox) {
    throw new ManualReviewError('정모 공지 체크박스를 찾을 수 없음', { stage: 'set_notice' });
  }
  if (checkBox.selected === notify) return;

  await tap(adb, deviceId, checkBox.center);
  await sleep(800);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const after = findByResourceId(nodes, 'check_box');
  if (after?.selected !== notify) {
    throw new ManualReviewError('정모 공지 설정을 바꾸지 못했음', {
      stage: 'set_notice',
      expected: notify,
      actual: after?.selected ?? null,
    });
  }
}

// 폼이 사진을 받았는지. 안내 문구가 사라지면 받은 것이다.
export function isPhotoAttached(nodes) {
  return !nodes.some((n) => n.text === PHOTO_PLACEHOLDER_TEXT);
}

// 정모 사진 첨부. 앱이 사진 없이는 제출을 받지 않아서 필요한 단계다.
//
// 기기로 이미지를 밀어 넣고 → 폼의 사진 영역을 눌러 시스템 선택기를 열고 →
// 가장 최근 사진(방금 넣은 것)을 고르고 → 앱 내부 크롭 화면을 통과한다.
// 화면마다 다시 읽어 확인하며, 확인되지 않으면 추측하지 않고 실패시킨다.
async function attachMeetupPhoto(adb, deviceId, artifactDir, photoPath) {
  const localPath = photoPath || path.join(artifactDir, 'meetup-photo.png');
  if (!photoPath) {
    await mkdir(artifactDir, { recursive: true });
    await writeFile(localPath, createSolidPng());
  }
  await adb.push(deviceId, localPath, REMOTE_PHOTO_PATH);
  // 미디어 DB에 올려야 선택기 목록에 보인다.
  await adb.shell(deviceId, [
    `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${REMOTE_PHOTO_PATH}`,
  ]);
  await sleep(800);

  // 앞선 텍스트 입력으로 키보드가 떠 있으면 사진 영역 탭이 삼켜진다.
  await hideKeyboardIfShown(adb, deviceId);

  let nodes = await readScreen(adb, deviceId, artifactDir);
  const pictureArea = findByResourceId(nodes, 'picture_layout2');
  if (!pictureArea) {
    throw new ManualReviewError('정모사진 영역을 찾을 수 없음', { stage: 'attach_photo' });
  }
  await tap(adb, deviceId, pictureArea.center);

  // 시스템 사진 선택기가 뜰 때까지 기다린다. 앱과 다른 패키지라 그걸로 판정한다.
  let picked = null;
  for (let i = 0; i < 10 && !picked; i += 1) {
    await sleep(1000);
    nodes = await readScreen(adb, deviceId, artifactDir);
    // 방금 push한 사진이 가장 최근이라 목록 첫 항목이다.
    picked = nodes.find(
      (n) => n.packageName !== APP_PACKAGE && n.contentDesc.startsWith('Photo taken on'),
    );
  }
  if (!picked) {
    throw new ManualReviewError('사진 선택기에서 사진을 찾을 수 없음', { stage: 'attach_photo' });
  }
  await tap(adb, deviceId, picked.center);

  // 앱 내부 크롭 화면(Edit Photo)이 이어진다. 그대로 Crop을 눌러 통과한다.
  let cropButton = null;
  for (let i = 0; i < 10 && !cropButton; i += 1) {
    await sleep(1000);
    nodes = await readScreen(adb, deviceId, artifactDir);
    cropButton = findByResourceId(nodes, 'menu_crop');
  }
  if (!cropButton) {
    throw new ManualReviewError('사진 크롭 화면을 찾을 수 없음', { stage: 'attach_photo' });
  }
  await tap(adb, deviceId, cropButton.center);

  // 폼으로 돌아와 사진이 실제로 붙었는지 확인한다. 폼 도착 판정에 save_button을
  // 쓰면 안 된다 — 가로 화면에서는 폼 아래쪽이라 덤프에 안 잡힌다. 항상 보이는
  // 화면 제목으로 판정한다.
  for (let i = 0; i < 10; i += 1) {
    await sleep(1000);
    nodes = await readScreen(adb, deviceId, artifactDir);
    if (nodes.some((n) => n.text === '정모 개설') && isPhotoAttached(nodes)) return;
  }
  throw new ManualReviewError('사진을 붙였는지 확인할 수 없음', { stage: 'attach_photo' });
}

// 입력칸 하나를 채운다.
//
// 매번 키보드를 내리고 화면을 다시 읽는다. 키보드가 떠 있으면 그 아래 칸은 탭이
// 삼켜져 포커스가 앞 칸에 머무르고, 키보드가 오르내리면서 남은 칸의 좌표도 바뀐다
// (가로 모드에서 제목만 들어가고 나머지가 통째로 비어 나왔다).
async function fillField(adb, deviceId, artifactDir, fieldId, value) {
  await hideKeyboardIfShown(adb, deviceId);
  const nodes = await readScreen(adb, deviceId, artifactDir);
  const field = findByResourceId(nodes, fieldId);
  if (!field) {
    throw new ManualReviewError(`${fieldId} field not found`, { stage: 'fill_form' });
  }

  await tap(adb, deviceId, field.center);
  await sleep(300);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, value);
  await sleep(300);
}

async function fillTextFields(adb, deviceId, artifactDir, payload) {
  await fillField(adb, deviceId, artifactDir, 'name_edit', payload.title);
  await fillField(adb, deviceId, artifactDir, 'location_edit', payload.location);

  // "새 게시글 자동 생성" 모드인 이 화면엔 description을 넣을 자리가 없다(정모
  // 안내문은 제목/일시/장소/비용으로 자동 생성된다). "기존 게시글 연동" 모드로
  // 바꾸지 않는 한 채울 수 없는, 확인된 앱 제약이라 description은 그냥 건너뛴다.

  if (payload.cost) {
    await fillField(adb, deviceId, artifactDir, 'expense_edit', payload.cost);
  }
  await fillField(adb, deviceId, artifactDir, 'max_count_edit', String(payload.capacity));
}

function buildExpectedFieldValues(payload, target) {
  const expected = {
    name_edit: payload.title,
    location_edit: payload.location,
    max_count_edit: String(payload.capacity),
    date_text: formatKoreanDate(target),
    time_text: formatKoreanTime(target),
  };
  if (payload.cost) expected.expense_edit = payload.cost;
  return expected;
}

// 폼 전체를 위에서 아래로 훑으며 값을 모은다. 가로 화면에서는 폼이 한 화면에 다
// 들어오지 않아, 한 번만 읽으면 화면 밖 칸이 "비어 있음"으로 보인다.
async function collectFormValues(adb, deviceId, artifactDir, ids) {
  // 먼저 맨 위로 올린다. 앞 단계에서 아래로 스크롤해 둔 상태일 수 있다.
  for (let i = 0; i < 5; i += 1) {
    await adb.shell(deviceId, ['input', 'swipe', '1280', '500', '1280', '1300', '200']);
  }
  await sleep(600);

  const found = new Map();
  for (let pass = 0; pass < 6; pass += 1) {
    const nodes = await readScreen(adb, deviceId, artifactDir);
    for (const id of ids) {
      if (found.has(id)) continue;
      const node = findByResourceId(nodes, id);
      if (node) found.set(id, node.text);
    }
    if (found.size === ids.length) break;
    await adb.shell(deviceId, ['input', 'swipe', '1280', '1300', '1280', '500', '300']);
    await sleep(700);
  }
  return found;
}

async function verifyForm(adb, deviceId, artifactDir, payload, target) {
  const expected = buildExpectedFieldValues(payload, target);
  const values = await collectFormValues(adb, deviceId, artifactDir, Object.keys(expected));

  const mismatches = [];
  for (const [id, expectedValue] of Object.entries(expected)) {
    const actual = values.get(id);
    if (actual !== expectedValue) {
      mismatches.push({ field: id, expected: expectedValue, actual: actual ?? null });
    }
  }
  if (mismatches.length > 0) {
    throw new ManualReviewError('Filled form does not match the requested payload', {
      stage: 'verify_form',
      mismatches,
    });
  }
}

// 정모 개설 폼이 아직 화면에 있는지. 저장을 눌렀는데 폼이 그대로면 앱이 제출을
// 받지 않은 것이다(검증 실패, 네트워크 오류 등).
export function isCreateFormPresent(nodes) {
  return nodes.some((n) => n.text === '정모 개설')
    || nodes.some((n) => n.resourceId.endsWith('/save_button') && n.text === '정모 만들기');
}

// 제출 후 화면을 판정한다.
//
// "폼이 안 보이면 성공"으로 읽으면 안 된다. uiautomator는 맨 위 창만 덤프하므로
// 폼을 덮는 창이 있으면 폼 노드가 통째로 사라진다. 실기기에서 두 번 당했다 —
// 사진 선택기(다른 패키지)가 덮었을 때, 그리고 앱 자신의 "잠시만 기다려주세요."
// 로딩 다이얼로그가 덮었을 때. 둘 다 만들어지지 않은/아직 만들어지는 중인 정모를
// succeeded로 보고했다.
//
// 그래서 부재가 아니라 존재로 판정한다: 생성된 정모 게시글이 보이고 그 제목이
// payload와 같을 때만 성공이다.
// 만들어진 정모 게시글의 제목과 일시 줄을 함께 확보한다. 가로 화면에서는 둘이 한
// 화면에 같이 있지 않아, 한 번만 읽으면 둘 중 하나는 반드시 없다.
async function collectPostNodes(adb, deviceId, artifactDir) {
  const merged = [];
  const seen = new Set();
  const has = (id) => merged.some((n) => n.resourceId.endsWith(`/${id}`));

  for (let i = 0; i < 4; i += 1) {
    for (const node of await readScreen(adb, deviceId, artifactDir)) {
      const key = `${node.resourceId}|${node.text}|${node.bounds?.y1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(node);
    }
    if (has('event_info') && has('title_text')) break;
    await adb.shell(deviceId, ['input', 'swipe', '1280', '1100', '1280', '700', '300']);
    await sleep(700);
  }
  return merged;
}

export function evaluateSubmitOutcome(nodes, { title } = {}) {
  if (nodes.length === 0) return { ok: false, reason: 'empty_screen' };

  const foreign = nodes.find((n) => n.packageName && n.packageName !== APP_PACKAGE);
  if (foreign) {
    return { ok: false, reason: 'foreign_window', packageName: foreign.packageName };
  }
  if (isCreateFormPresent(nodes)) return { ok: false, reason: 'form_still_present' };

  // 생성 성공 시 앱은 만들어진 정모 게시글로 이동한다. event_info 한 줄에
  // 일시·장소·비용이 함께 들어 있어 이게 곧 결과 확인이다.
  const eventInfo = findByResourceId(nodes, 'event_info');
  if (!eventInfo) return { ok: false, reason: 'no_event_post' };

  const postTitle = findByResourceId(nodes, 'title_text');
  if (title && postTitle?.text !== title) {
    return { ok: false, reason: 'title_mismatch', expected: title, actual: postTitle?.text ?? null };
  }
  return { ok: true, eventInfo: eventInfo.text };
}

export function createCreateMeetupHandler({
  adb,
  artifactDir = './worker-artifacts',
  targetGroupName = DEFAULT_TARGET_GROUP_NAME,
  // 정모 사진으로 쓸 로컬 이미지. 비우면 단색 16:9 플레이스홀더를 만들어 쓴다.
  photoPath = '',
  // 정모를 만들 때 클럽 전원에게 알림을 보낼지. 자동 등록의 목적이 알리는 것이라
  // 기본은 켜짐이고, 실기기 시험처럼 실제 멤버를 건드리면 안 될 때만 끈다.
  notifyMembers = true,
} = {}) {
  return async function createMeetup({ payload, deviceId, mode, jobId, onBeforeSubmit }) {
    if (mode !== 'dryRun' && mode !== 'submit') {
      throw new ManualReviewError(`Unknown mode "${mode}"`, { stage: 'validate_mode' });
    }
    if (!payload?.title || !payload?.location || !payload?.scheduledAt || !payload?.capacity) {
      throw new ManualReviewError('payload is missing required fields', { stage: 'validate_payload' });
    }

    const target = toKstParts(payload.scheduledAt);
    assertScheduledAtIsFuture(payload.scheduledAt);

    // job마다 따로 남긴다. 예전처럼 한 파일을 계속 덮어쓰면 다음 job이 시작되는
    // 순간 실패 증거가 사라져서, 실패한 job의 마지막 화면을 볼 수 없다.
    const jobArtifactDir = jobId ? path.join(artifactDir, String(jobId)) : artifactDir;

    await assertDeviceTimezone(adb, deviceId);
    await adb.shell(deviceId, ['ime', 'set', ADB_KEYBOARD_IME]);
    await launchApp(adb, deviceId, jobArtifactDir);
    const groupName = await openJoinedGroup(adb, deviceId, jobArtifactDir, targetGroupName);
    await openCreateMeetupForm(adb, deviceId, jobArtifactDir, targetGroupName);

    await setDateAndTime(adb, deviceId, jobArtifactDir, target);
    await fillTextFields(adb, deviceId, jobArtifactDir, payload);

    // 사진은 submit에서만 붙인다. dryRun은 제출하지 않으므로 필요 없고, 붙이려면
    // 기기에 파일을 밀어 넣고 선택기·크롭을 거쳐야 해서 화면을 더 건드리게 된다.
    if (mode === 'submit') {
      await attachMeetupPhoto(adb, deviceId, jobArtifactDir, photoPath);
    }

    // 알림 설정은 dryRun에서도 맞춰 둔다. 제출 직전 화면이 실제 제출될 모습과
    // 같아야 dry-run이 의미가 있다.
    await setNoticeCheckbox(adb, deviceId, jobArtifactDir, notifyMembers);

    // 텍스트 입력 뒤에는 키보드가 떠 있다. 사진 영역이나 저장 버튼을 가릴 수 있어
    // 확인·제출 전에 내린다.
    await hideKeyboardIfShown(adb, deviceId);

    await verifyForm(adb, deviceId, jobArtifactDir, payload, target);

    if (mode === 'dryRun') {
      const evidence = await captureEvidence(adb, deviceId, jobArtifactDir, jobId, 'before-submit');
      return { stoppedAt: 'before_submit', groupName, ...evidence };
    }

    // mode === 'submit': verifyForm이 방금 화면이 payload와 일치함을 확인했으므로
    // SOMOIM_AUTOMATION.md의 "제출 직전 화면이 payload와 일치" 조건을 만족한다.
    // 가로 화면에서는 저장 버튼이 폼 아래쪽이라 보일 때까지 스크롤해야 한다.
    const nodes = await scrollUntilFound(adb, deviceId, jobArtifactDir, 'save_button');
    const saveButton = nodes.find((n) => n.resourceId.endsWith('/save_button') && n.text === '정모 만들기');
    if (!saveButton) {
      throw new ManualReviewError('정모 만들기 저장 버튼을 찾을 수 없음', { stage: 'submit' });
    }

    // 누르기 전에 서버에 "제출을 시도한다"고 남긴다. 이 표시가 있어야 보고가 끊겼을 때
    // 서버가 이 job을 자동 재시도하지 않는다(재시도하면 정모가 하나 더 생긴다).
    // 표시에 실패하면 누르지 않고 물러난다 — 아직 아무것도 만들지 않았으므로
    // 그대로 재시도해도 안전한 상태다.
    if (onBeforeSubmit) {
      try {
        await onBeforeSubmit();
      } catch (error) {
        throw new TransientError(
          `Could not record the submit attempt, so the submit was skipped: ${error?.message ?? 'unknown error'}`,
          { stage: 'submit' },
        );
      }
    }

    await tap(adb, deviceId, saveButton.center);

    // 버튼을 눌렀다는 사실을 성공으로 삼지 않는다. 만들어진 정모 게시글이 보일
    // 때까지 기다린다. 제출 중에는 앱이 로딩 다이얼로그를 띄우므로 넉넉히 본다.
    let outcome = { ok: false, reason: 'not_checked' };
    for (let i = 0; i < 20 && !outcome.ok; i += 1) {
      await sleep(1000);
      outcome = evaluateSubmitOutcome(
        await collectPostNodes(adb, deviceId, jobArtifactDir),
        { title: payload.title },
      );
    }

    const evidence = await captureEvidence(adb, deviceId, jobArtifactDir, jobId, 'after-submit');
    if (!outcome.ok) {
      throw new ManualReviewError(
        `Tapped 정모 만들기 but could not confirm the submit (${outcome.reason})`,
        { stage: 'submit', ...outcome, ...evidence },
      );
    }

    return { stoppedAt: null, submitted: true, groupName, eventInfo: outcome.eventInfo, ...evidence };
  };
}
