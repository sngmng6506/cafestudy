import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ManualReviewError, TransientError } from '../errors.js';

// 소모임 앱(com.friendscube.somoim) 자동화 상수.
//
// 이 bot 계정은 "[홍대] it&ai 스터디" 클럽 운영진 권한만 가지고 있고, 다른 클럽은
// 쓰지 않는다(사용자 확정). payload에 groupId가 없으므로 이 클럽 하나로 고정한다.
const APP_PACKAGE = 'com.friendscube.somoim';
const TARGET_GROUP_NAME = '[홍대] it&ai 스터디';
const SEARCH_QUERY = '홍대 it';
const ADB_KEYBOARD_IME = 'com.android.adbkeyboard/.AdbIME';

const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ---- 화면 트리 파싱 (순수 함수, 기기 없이 테스트 가능) ----

function decodeXmlEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseUiNodes(xml) {
  const nodes = [];
  // 자식이 있는 노드는 <node ...>...</node>로, 리프 노드는 <node .../>로 끝난다.
  // 뒤가 "/>"인지는 신경 쓰지 않고 첫 ">"까지만 잡아야 컨테이너 노드도 놓치지 않는다.
  const nodeRe = /<node\b([^>]*)>/g;
  const attrRe = /([\w:-]+)="([^"]*)"/g;
  let nodeMatch;
  while ((nodeMatch = nodeRe.exec(xml))) {
    const attrs = {};
    attrRe.lastIndex = 0;
    let attrMatch;
    while ((attrMatch = attrRe.exec(nodeMatch[1]))) {
      attrs[attrMatch[1]] = decodeXmlEntities(attrMatch[2]);
    }
    const boundsMatch = (attrs.bounds || '').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    const bounds = boundsMatch
      ? {
          x1: Number(boundsMatch[1]),
          y1: Number(boundsMatch[2]),
          x2: Number(boundsMatch[3]),
          y2: Number(boundsMatch[4]),
        }
      : null;
    nodes.push({
      text: attrs.text || '',
      contentDesc: attrs['content-desc'] || '',
      resourceId: attrs['resource-id'] || '',
      className: attrs.class || '',
      packageName: attrs.package || '',
      clickable: attrs.clickable === 'true',
      enabled: attrs.enabled === 'true',
      selected: attrs.selected === 'true',
      bounds,
      center: bounds
        ? { x: Math.round((bounds.x1 + bounds.x2) / 2), y: Math.round((bounds.y1 + bounds.y2) / 2) }
        : null,
    });
  }
  return nodes;
}

export function findByResourceId(nodes, idSuffix) {
  return nodes.find((n) => n.resourceId.endsWith(`/${idSuffix}`));
}

// ---- 날짜/시간 변환 (순수 함수) ----

// scheduledAt(ISO, UTC)을 한국 표준시(UTC+9, DST 없음) 구성요소로 바꾼다.
// 실행 환경(worker 서버)의 로컬 타임존에 의존하지 않도록 UTC 접근자만 쓴다.
// 태블릿 자체가 한국 시간대로 설정돼 있다고 가정한다.
export function toKstParts(scheduledAt) {
  const instant = new Date(scheduledAt);
  if (Number.isNaN(instant.getTime())) {
    throw new ManualReviewError(`scheduledAt is not a valid date: ${scheduledAt}`, {
      stage: 'validate_payload',
    });
  }
  const kst = new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour24: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    weekday: kst.getUTCDay(),
  };
}

// 서버는 모임 생성 시점에만 "30분 뒤" 최소 리드타임을 검사한다. worker가 job을
// 집어들 때까지는 큐 대기·stale-claim 재시도(최악의 경우 900초 x 3회 = 45분)와
// 호스트가 임의 시점에 누르는 재시도가 끼어들 수 있어, 그 사이 scheduledAt이 실제로
// 지나가 버릴 수 있다. 지난 시각으로 화면을 채우려 들면(달력을 거꾸로 넘기는 등)
// 결과를 예측할 수 없으니 시도 자체를 하지 않는다.
export function assertScheduledAtIsFuture(scheduledAt, now = Date.now()) {
  if (new Date(scheduledAt).getTime() <= now) {
    throw new ManualReviewError(`scheduledAt has already passed: ${scheduledAt}`, {
      stage: 'validate_payload',
    });
  }
}

export function to12Hour(hour24) {
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12raw = hour24 % 12;
  return { hour12: hour12raw === 0 ? 12 : hour12raw, period };
}

export function formatKoreanDate({ month, day, weekday }) {
  return `${month}월 ${day}일 (${KO_WEEKDAYS[weekday]})`;
}

export function formatKoreanTime({ hour24, minute }) {
  const { hour12, period } = to12Hour(hour24);
  return `${period === 'AM' ? '오전' : '오후'} ${hour12}:${String(minute).padStart(2, '0')}`;
}

export function formatEnglishHeader({ year, month, day, weekday }) {
  return {
    yearText: String(year),
    dateText: `${EN_WEEKDAYS[weekday]}, ${EN_MONTHS[month - 1]} ${day}`,
  };
}

export function parseEnglishHeaderDate(text) {
  const match = text.match(/^\w+,\s*(\w+)\s+(\d{1,2})$/);
  if (!match) return null;
  const month = EN_MONTHS.indexOf(match[1]) + 1;
  if (month <= 0) return null;
  return { month, day: Number(match[2]) };
}

export function monthsBetween(from, to) {
  return (to.year * 12 + to.month) - (from.year * 12 + from.month);
}

// ---- 기기 조작 (adb 래퍼 위에 얇게) ----

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tap(adb, deviceId, point) {
  await adb.shell(deviceId, ['input', 'tap', String(point.x), String(point.y)]);
}

// adb shell은 여러 argv를 공백으로 이어붙여 원격 셸에 한 줄로 보낸다(로컬 따옴표가
// 보존되지 않는다). 원격 셸이 다시 파싱하도록 명령 전체를 인자 하나로 넘긴다.
function escapeForRemoteDoubleQuotes(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

async function typeText(adb, deviceId, text) {
  const escaped = escapeForRemoteDoubleQuotes(text);
  await adb.shell(deviceId, [`am broadcast -a ADB_INPUT_TEXT --es msg "${escaped}"`]);
}

// ADBKeyBoard의 ADB_CLEAR_TEXT는 포커스된 입력창 전체를 지운다(공식 문서에 명시된
// 표준 액션). 기존 글자 수를 세어 backspace를 보내는 것보다 안전하다.
async function clearFocusedField(adb, deviceId) {
  await adb.shell(deviceId, ['am broadcast -a ADB_CLEAR_TEXT']);
}

async function readScreen(adb, deviceId, artifactDir) {
  await mkdir(artifactDir, { recursive: true });
  const dumpPath = path.join(artifactDir, 'ui-dump.xml');
  await adb.dumpUi(deviceId, dumpPath);
  const xml = await readFile(dumpPath, 'utf8');
  return parseUiNodes(xml);
}

async function captureEvidence(adb, deviceId, artifactDir, name) {
  await mkdir(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, `create-meetup-${Date.now()}-${name}.png`);
  await adb.captureScreenshot(deviceId, screenshotPath);
  return screenshotPath;
}

// ---- 화면 이동 ----

// 매번 강제 종료 후 재실행해 알 수 없는 이전 화면 상태(뒤로가기 스택, 남은 다이얼로그
// 등)에 의존하지 않는 결정적인 시작점을 만든다. 콜드 스타트는 웜 스타트보다 훨씬
// 느릴 수 있어(수 초) 고정 sleep 대신 홈 화면이 뜰 때까지 폴링한다.
async function launchApp(adb, deviceId, artifactDir) {
  await adb.shell(deviceId, ['am', 'force-stop', APP_PACKAGE]);
  await adb.shell(deviceId, ['monkey', '-p', APP_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1']);

  const attempts = 10;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(1000);
    const nodes = await readScreen(adb, deviceId, artifactDir);
    if (findByResourceId(nodes, 'search_btn_layout')) return;
  }
  // 아직 아무 입력도 하지 않은 상태의 순수한 앱 실행 지연이므로 TransientError다
  // (SOMOIM_AUTOMATION.md의 needsManualReview 예외 케이스).
  throw new TransientError('App did not reach the home screen before launch timeout', {
    stage: 'launch',
  });
}

async function searchAndOpenGroup(adb, deviceId, artifactDir) {
  let nodes = await readScreen(adb, deviceId, artifactDir);
  const searchIcon = findByResourceId(nodes, 'search_btn_layout');
  if (!searchIcon) {
    throw new ManualReviewError('Search icon not found on the home screen', { stage: 'open_search' });
  }
  await tap(adb, deviceId, searchIcon.center);
  await sleep(600);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const searchField = findByResourceId(nodes, 'search_searchedit');
  if (!searchField) {
    throw new ManualReviewError('Search field did not open', { stage: 'open_search' });
  }
  await tap(adb, deviceId, searchField.center);
  await sleep(300);
  await typeText(adb, deviceId, SEARCH_QUERY);
  await sleep(300);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const searchButton = findByResourceId(nodes, 'search_btn_layout');
  if (!searchButton) {
    throw new ManualReviewError('Search execute button not found', { stage: 'search_club' });
  }
  await tap(adb, deviceId, searchButton.center);
  await sleep(800);

  nodes = await readScreen(adb, deviceId, artifactDir);
  const clubNode = nodes.find(
    (n) => n.resourceId.endsWith('/groupname_text') && n.text === TARGET_GROUP_NAME,
  );
  if (!clubNode) {
    throw new ManualReviewError(`Target group "${TARGET_GROUP_NAME}" not found in search results`, {
      stage: 'search_club',
    });
  }
  // 결과 행 전체가 탭 대상이라 카드 텍스트의 y좌표 + 화면 가로 중앙을 쓴다.
  await tap(adb, deviceId, { x: 800, y: clubNode.center.y });
  await sleep(800);
}

async function openCreateMeetupForm(adb, deviceId, artifactDir) {
  let nodes = await readScreen(adb, deviceId, artifactDir);
  const clubTitle = findByResourceId(nodes, 'name_text');
  if (!clubTitle || clubTitle.text !== TARGET_GROUP_NAME) {
    throw new ManualReviewError('Did not land on the target group page', { stage: 'open_group_page' });
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

  await tap(adb, deviceId, minuteField.center);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, String(target.minute).padStart(2, '0'));
  await sleep(200);

  await tap(adb, deviceId, ampmSpinner.center);
  await sleep(500);

  // 드롭다운 팝업 애니메이션이 아직 자리 잡는 중이면 첫 탭이 씹힐 수 있고, 씹힌
  // 뒤 같은 좌표를 재탭하면 그 사이 스피너가 닫혔다 다시 열려 옵션 위치가 바뀔 수
  // 있다(라이브 기기에서 둘 다 확인함). 그래서 매 시도마다 화면을 새로 읽어
  // 드롭다운이 열려 있는지/닫혔는지부터 다시 판단한다.
  let timeOkButton;
  for (let attempt = 0; attempt < 4 && !timeOkButton; attempt += 1) {
    nodes = await readScreen(adb, deviceId, artifactDir);
    timeOkButton = nodes.find((n) => n.resourceId.endsWith('/button1') && n.text === 'OK');
    if (timeOkButton) break;

    const periodOption = nodes.find((n) => n.resourceId.endsWith('/text1') && n.text === period);
    if (periodOption) {
      await tap(adb, deviceId, periodOption.center);
    } else {
      const spinner = findByResourceId(nodes, 'am_pm_spinner');
      if (!spinner) throw new ManualReviewError('AM/PM spinner not found', { stage: 'set_time' });
      await tap(adb, deviceId, spinner.center);
    }
    await sleep(500);
  }
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

async function fillTextFields(adb, deviceId, artifactDir, payload) {
  let nodes = await readScreen(adb, deviceId, artifactDir);
  const nameField = findByResourceId(nodes, 'name_edit');
  const locationField = findByResourceId(nodes, 'location_edit');
  const maxCountField = findByResourceId(nodes, 'max_count_edit');
  if (!nameField || !locationField || !maxCountField) {
    throw new ManualReviewError('정모 개설 form fields not found', { stage: 'fill_form' });
  }

  await tap(adb, deviceId, nameField.center);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, payload.title);
  await sleep(200);

  await tap(adb, deviceId, locationField.center);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, payload.location);
  await sleep(200);

  // "새 게시글 자동 생성" 모드인 이 화면엔 description을 넣을 자리가 없다(정모
  // 안내문은 제목/일시/장소/비용으로 자동 생성된다). "기존 게시글 연동" 모드로
  // 바꾸지 않는 한 채울 수 없는, 확인된 앱 제약이라 description은 그냥 건너뛴다.

  if (payload.cost) {
    nodes = await readScreen(adb, deviceId, artifactDir);
    const costField = findByResourceId(nodes, 'expense_edit');
    if (!costField) throw new ManualReviewError('expense_edit field not found', { stage: 'fill_form' });
    await tap(adb, deviceId, costField.center);
    await clearFocusedField(adb, deviceId);
    await typeText(adb, deviceId, payload.cost);
    await sleep(200);
  }

  await tap(adb, deviceId, maxCountField.center);
  await clearFocusedField(adb, deviceId);
  await typeText(adb, deviceId, String(payload.capacity));
  await sleep(200);
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

async function verifyForm(adb, deviceId, artifactDir, payload, target) {
  const nodes = await readScreen(adb, deviceId, artifactDir);
  const expected = buildExpectedFieldValues(payload, target);
  const mismatches = [];
  for (const [id, expectedValue] of Object.entries(expected)) {
    const node = findByResourceId(nodes, id);
    if (!node || node.text !== expectedValue) {
      mismatches.push({ field: id, expected: expectedValue, actual: node?.text ?? null });
    }
  }
  if (mismatches.length > 0) {
    throw new ManualReviewError('Filled form does not match the requested payload', {
      stage: 'verify_form',
      mismatches,
    });
  }
}

export function createCreateMeetupHandler({ adb, artifactDir = './worker-artifacts' } = {}) {
  return async function createMeetup({ payload, deviceId, mode }) {
    if (mode !== 'dryRun' && mode !== 'submit') {
      throw new ManualReviewError(`Unknown mode "${mode}"`, { stage: 'validate_mode' });
    }
    if (!payload?.title || !payload?.location || !payload?.scheduledAt || !payload?.capacity) {
      throw new ManualReviewError('payload is missing required fields', { stage: 'validate_payload' });
    }

    const target = toKstParts(payload.scheduledAt);
    assertScheduledAtIsFuture(payload.scheduledAt);

    await adb.shell(deviceId, ['ime', 'set', ADB_KEYBOARD_IME]);
    await launchApp(adb, deviceId, artifactDir);
    await searchAndOpenGroup(adb, deviceId, artifactDir);
    await openCreateMeetupForm(adb, deviceId, artifactDir);

    await setDateAndTime(adb, deviceId, artifactDir, target);
    await fillTextFields(adb, deviceId, artifactDir, payload);

    await verifyForm(adb, deviceId, artifactDir, payload, target);

    if (mode === 'dryRun') {
      const screenshotKey = await captureEvidence(adb, deviceId, artifactDir, 'before-submit');
      return { stoppedAt: 'before_submit', screenshotKey };
    }

    // mode === 'submit': verifyForm이 방금 화면이 payload와 일치함을 확인했으므로
    // SOMOIM_AUTOMATION.md의 "제출 직전 화면이 payload와 일치" 조건을 만족한다.
    const nodes = await readScreen(adb, deviceId, artifactDir);
    const saveButton = nodes.find((n) => n.resourceId.endsWith('/save_button') && n.text === '정모 만들기');
    if (!saveButton) {
      throw new ManualReviewError('정모 만들기 저장 버튼을 찾을 수 없음', { stage: 'submit' });
    }
    await tap(adb, deviceId, saveButton.center);
    await sleep(1200);
    const screenshotKey = await captureEvidence(adb, deviceId, artifactDir, 'after-submit');
    return { stoppedAt: null, submitted: true, screenshotKey };
  };
}
