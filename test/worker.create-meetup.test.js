import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateSubmitOutcome,
  isCreateFormPresent,
  fitLocationForApp,
  buildExpectedFieldValues,
  costForApp,
  buildNaverMapUrl,
} from '../worker/handlers/create-meetup.js';
import {
  assertScheduledAtIsFuture,
  buildScreenshotKey,
  findByResourceId,
  formatEnglishHeader,
  formatKoreanDate,
  formatKoreanTime,
  monthsBetween,
  parseEnglishHeaderDate,
  joinedGroupsBelow,
  parseUiNodes,
  to12Hour,
  toKstParts,
  uniqueByBounds,
  typeText,
  findCrashDialogButton,
  clearFocusedField,
} from '../worker/somoim-app.js';

// 실제 uiautomator dump에서 뽑아낸 조각들(이 세션에서 태블릿으로 직접 확인한 값).
const GROUP_SEARCH_RESULT_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="[홍대] it&amp;ai 스터디" resource-id="com.friendscube.somoim:id/groupname_text" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[196,660][1568,708]" drawing-order="1" hint="" /></hierarchy>`;

const DATE_PICKER_HEADER_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="2026" resource-id="android:id/date_picker_header_year" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[504,820][612,894]" drawing-order="1" hint="" /><node index="1" text="Sat, Sep 5" resource-id="android:id/date_picker_header_date" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[520,878][856,967]" drawing-order="2" hint="" /></hierarchy>`;

test('parseUiNodes: decodes XML entities and computes bounds/center', () => {
  const nodes = parseUiNodes(GROUP_SEARCH_RESULT_XML);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].text, '[홍대] it&ai 스터디');
  assert.equal(nodes[0].resourceId, 'com.friendscube.somoim:id/groupname_text');
  assert.deepEqual(nodes[0].bounds, { x1: 196, y1: 660, x2: 1568, y2: 708 });
  assert.deepEqual(nodes[0].center, { x: 882, y: 684 });
  assert.equal(nodes[0].enabled, true);
  assert.equal(nodes[0].clickable, false);
});

test('parseUiNodes: returns an empty list for a screen with no nodes', () => {
  assert.deepEqual(parseUiNodes('<hierarchy rotation="0"></hierarchy>'), []);
});

// 내모임 화면을 실제로 덤프한 조각. 가입 모임은 name_text, 추천 카드는
// groupname_text로 id가 갈린다. 그리고 같은 창이 두 벌 들어온다.
const MY_GROUPS_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="9" text="가입한 모임" resource-id="com.friendscube.somoim:id/text" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[116,500][400,545]" /><node index="0" text="[홍대] it&amp;ai 스터디" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[164,602][392,644]" /><node index="1" text="용인 독서모임" resource-id="com.friendscube.somoim:id/groupname_text" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[196,2159][1496,2207]" /><node index="0" text="[홍대] it&amp;ai 스터디" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[164,602][392,644]" /><node index="1" text="내모임" resource-id="com.friendscube.somoim:id/tab_text" class="android.widget.TextView" package="com.friendscube.somoim" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[973,2485][1027,2515]" /></hierarchy>`;

test('uniqueByBounds: folds the duplicated window dump into one group', () => {
  const joined = parseUiNodes(MY_GROUPS_XML).filter((n) => n.resourceId.endsWith('/name_text'));
  assert.equal(joined.length, 2, 'uiautomator가 같은 창을 두 벌 내보낸다');

  const unique = uniqueByBounds(joined);
  assert.equal(unique.length, 1, '같은 위치의 노드는 같은 모임이다');
  assert.equal(unique[0].text, '[홍대] it&ai 스터디');
  assert.deepEqual(unique[0].center, { x: 278, y: 623 });
});

test('uniqueByBounds: keeps nodes that sit at different positions', () => {
  const nodes = [
    { bounds: { x1: 0, y1: 0, x2: 10, y2: 10 } },
    { bounds: { x1: 0, y1: 20, x2: 10, y2: 30 } },
  ];
  assert.equal(uniqueByBounds(nodes).length, 2);
});

// 회귀 방지: 추천 카드를 가입 모임으로 착각하면 남의 모임에 정모를 만들 수 있다.
test('가입 모임은 name_text로만 고르고 추천 카드는 섞이지 않는다', () => {
  const nodes = parseUiNodes(MY_GROUPS_XML);
  const joined = uniqueByBounds(nodes.filter((n) => n.resourceId.endsWith('/name_text')));

  assert.deepEqual(joined.map((n) => n.text), ['[홍대] it&ai 스터디']);
  assert.ok(
    nodes.some((n) => n.resourceId.endsWith('/groupname_text')),
    '화면에 추천 카드가 함께 있는 상황을 재현해야 의미가 있다',
  );
});

// 회귀 방지: 홈 화면에서도 name_text가 쓰인다. 정모 이름이다. "가입한 모임"
// 헤더를 확인하지 않고 name_text를 세면 남의 정모를 가입 모임으로 착각한다.
const HOME_SCREEN_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="활동이 활발한 모임" resource-id="com.friendscube.somoim:id/text" class="android.widget.TextView" bounds="[100,400][500,440]" /><node index="1" text="&#127939;용인런(87~99)" resource-id="com.friendscube.somoim:id/groupname_text" class="android.widget.TextView" bounds="[196,900][1496,948]" /><node index="2" text="2회차 정모" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" bounds="[196,960][1496,1008]" /><node index="3" text="용인시 ∙ 오늘 20:00 ∙ 9명 참석중" resource-id="com.friendscube.somoim:id/location_text" class="android.widget.TextView" bounds="[196,1020][1496,1060]" /></hierarchy>`;

test('홈 화면의 name_text는 정모 이름이지 가입 모임이 아니다', () => {
  const nodes = parseUiNodes(HOME_SCREEN_XML);

  assert.ok(
    nodes.some((n) => n.resourceId.endsWith('/name_text')),
    '홈 화면에도 name_text가 있다는 것이 이 테스트의 전제다',
  );
  assert.equal(
    nodes.some((n) => n.text === '가입한 모임'),
    false,
    '"가입한 모임" 헤더가 없으므로 내모임 화면이 아니다 — 여기서 세면 안 된다',
  );
});

// 회귀 방지: 정모를 하나라도 만들면 내모임 위쪽에 "참여중인 정모 채팅" 섹션이
// 생기고 거기에도 같은 클럽 이름이 name_text로 나온다. 위치를 안 따지면 클럽 대신
// 정모 채팅방이 열린다(실기기에서 겪음).
const MY_GROUPS_WITH_EVENT_CHAT_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="3"><node index="0" text="참여중인 정모 채팅" resource-id="com.friendscube.somoim:id/text" class="android.widget.TextView" bounds="[32,472][258,514]" /><node index="1" text="[홍대] it&amp;ai 스터디" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" bounds="[34,656][150,720]" /><node index="2" text="가입한 모임" resource-id="com.friendscube.somoim:id/text" class="android.widget.TextView" bounds="[32,770][187,818]" /><node index="3" text="[홍대] it&amp;ai 스터디" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" bounds="[164,884][392,926]" /></hierarchy>`;

test('joinedGroupsBelow: "가입한 모임" 아래의 모임만 고른다', () => {
  const nodes = parseUiNodes(MY_GROUPS_WITH_EVENT_CHAT_XML);
  const header = nodes.find((n) => n.text === '가입한 모임');

  const joined = joinedGroupsBelow(nodes, header);

  assert.equal(joined.length, 1, '정모 채팅 쪽 이름은 세면 안 된다');
  assert.deepEqual(joined[0].center, { x: 278, y: 905 });
});

test('joinedGroupsBelow: 헤더가 없으면 아무것도 고르지 않는다', () => {
  assert.deepEqual(joinedGroupsBelow(parseUiNodes(MY_GROUPS_WITH_EVENT_CHAT_XML), null), []);
});

test('내모임 화면은 "가입한 모임" 헤더로 구분한다', () => {
  assert.equal(
    parseUiNodes(MY_GROUPS_XML).some((n) => n.text === '가입한 모임'),
    true,
  );
});

test('내모임 탭은 tab_text와 정확한 이름으로 찾는다', () => {
  const tab = parseUiNodes(MY_GROUPS_XML).find(
    (n) => n.resourceId.endsWith('/tab_text') && n.text === '내모임',
  );
  assert.ok(tab);
  assert.deepEqual(tab.center, { x: 1000, y: 2500 });
});

test('findByResourceId: matches by suffix across app and android namespaces', () => {
  const nodes = parseUiNodes(DATE_PICKER_HEADER_XML);
  assert.equal(findByResourceId(nodes, 'date_picker_header_year').text, '2026');
  assert.equal(findByResourceId(nodes, 'date_picker_header_date').text, 'Sat, Sep 5');
  assert.equal(findByResourceId(nodes, 'does_not_exist'), undefined);
});

test('toKstParts: converts a UTC scheduledAt into KST wall-clock parts', () => {
  // 2026-09-05T10:00:00.000Z + 9h = 2026-09-05 19:00 KST (Saturday)
  const parts = toKstParts('2026-09-05T10:00:00.000Z');
  assert.deepEqual(parts, { year: 2026, month: 9, day: 5, hour24: 19, minute: 0, weekday: 6 });
});

test('toKstParts: a date near midnight UTC can roll into the next KST day', () => {
  // 2026-09-05T20:00:00.000Z + 9h = 2026-09-06 05:00 KST
  const parts = toKstParts('2026-09-05T20:00:00.000Z');
  assert.equal(parts.day, 6);
  assert.equal(parts.hour24, 5);
});

test('toKstParts: rejects an invalid date as a manual-review error', () => {
  assert.throws(() => toKstParts('not-a-date'), (error) => {
    assert.equal(error.needsManualReview, true);
    assert.match(error.message, /not a valid date/);
    return true;
  });
});

test('to12Hour: converts 24h boundaries to the 12h clock used by the time picker', () => {
  assert.deepEqual(to12Hour(0), { hour12: 12, period: 'AM' });
  assert.deepEqual(to12Hour(7), { hour12: 7, period: 'AM' });
  assert.deepEqual(to12Hour(12), { hour12: 12, period: 'PM' });
  assert.deepEqual(to12Hour(19), { hour12: 7, period: 'PM' });
  assert.deepEqual(to12Hour(23), { hour12: 11, period: 'PM' });
});

test('formatKoreanDate: matches the app’s date_text format', () => {
  assert.equal(formatKoreanDate({ month: 9, day: 5, weekday: 6 }), '9월 5일 (토)');
});

test('formatKoreanTime: matches the app’s time_text format', () => {
  assert.equal(formatKoreanTime({ hour24: 19, minute: 0 }), '오후 7:00');
  assert.equal(formatKoreanTime({ hour24: 9, minute: 5 }), '오전 9:05');
});

test('formatEnglishHeader: matches the date picker header format', () => {
  assert.deepEqual(formatEnglishHeader({ year: 2026, month: 9, day: 5, weekday: 6 }), {
    yearText: '2026',
    dateText: 'Sat, Sep 5',
  });
});

test('parseEnglishHeaderDate: reads the month/day back out of the header text', () => {
  assert.deepEqual(parseEnglishHeaderDate('Sat, Sep 5'), { month: 9, day: 5 });
  assert.deepEqual(parseEnglishHeaderDate('Sun, Aug 23'), { month: 8, day: 23 });
});

test('parseEnglishHeaderDate: returns null for unrecognised text instead of guessing', () => {
  assert.equal(parseEnglishHeaderDate('garbage'), null);
  assert.equal(parseEnglishHeaderDate('Sat, Foo 5'), null);
});

test('monthsBetween: counts month deltas across year boundaries', () => {
  assert.equal(monthsBetween({ year: 2026, month: 8 }, { year: 2026, month: 9 }), 1);
  assert.equal(monthsBetween({ year: 2026, month: 8 }, { year: 2026, month: 8 }), 0);
  assert.equal(monthsBetween({ year: 2026, month: 12 }, { year: 2027, month: 2 }), 2);
  assert.equal(monthsBetween({ year: 2026, month: 9 }, { year: 2026, month: 8 }), -1);
});

// 제출 성공 판정. 예전에는 버튼을 눌렀다는 사실만으로 succeeded를 보고했다 —
// 앱이 폼을 그대로 두고 거부해도 모임이 "등록됨"으로 표시됐다.
const CREATE_FORM_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="정모 개설" resource-id="" class="android.widget.TextView" bounds="[136,107][280,160]" /><node index="1" text="정모 만들기" resource-id="com.friendscube.somoim:id/save_button" class="android.widget.Button" bounds="[40,1888][1560,1984]" /></hierarchy>`;

const CLUB_PAGE_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="[홍대] it&amp;ai 스터디" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" bounds="[40,1099][1288,1155]" /><node index="1" text="정모 만들기" resource-id="com.friendscube.somoim:id/button2" class="android.widget.Button" bounds="[1064,2414][1568,2506]" /></hierarchy>`;

test('isCreateFormPresent: 폼이 그대로면 앱이 제출을 받지 않은 것이다', () => {
  assert.equal(isCreateFormPresent(parseUiNodes(CREATE_FORM_XML)), true);
});

test('isCreateFormPresent: 클럽 페이지의 "정모 만들기" 버튼은 폼이 아니다', () => {
  // 클럽 홈에도 같은 문구의 버튼이 있다. resource-id가 save_button이 아니므로
  // 폼으로 착각하면 안 된다 — 착각하면 성공한 제출을 실패로 보고한다.
  assert.equal(isCreateFormPresent(parseUiNodes(CLUB_PAGE_XML)), false);
});

test('isCreateFormPresent: 빈 화면은 폼이 아니다', () => {
  assert.equal(isCreateFormPresent([]), false);
});

// 실기기 submit에서 실제로 나온 화면. 정모 만들기를 누르자 앱이 사진 선택기를
// 띄웠고, uiautomator는 맨 위 창만 덤프하므로 폼 노드가 통째로 사라졌다.
// "폼이 없으면 성공"으로 읽던 판정이 이걸 성공으로 보고했고, 정모는 만들어지지
// 않았는데 succeeded가 됐다.
const PHOTO_PICKER_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="This app can only access the photos you select" resource-id="com.android.providers.media.module:id/privacy_text" class="android.widget.TextView" package="com.android.providers.media.module" bounds="[550,1082][1049,1111]" /><node index="1" text="Recent" resource-id="com.android.providers.media.module:id/date_header_title" class="android.widget.TextView" package="com.android.providers.media.module" bounds="[0,1271][1600,1383]" /></hierarchy>`;

// 실기기 submit에서 나온 두 번째 오탐. 제출 중에는 앱이 자기 패키지로 로딩
// 다이얼로그를 띄운다. 이것도 폼을 덮어 폼 노드를 지운다 — 아직 만들어지는 중인데
// 성공으로 보고했다.
const SUBMIT_LOADING_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="잠시만 기다려주세요." resource-id="" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[356,1000][690,1040]" /></hierarchy>`;

// 실제로 생성에 성공했을 때의 화면. 앱이 만들어진 정모 게시글로 이동한다.
const CREATED_EVENT_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="카페 스터디 테스트" resource-id="com.friendscube.somoim:id/title_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[40,330][1560,380]" /><node index="1" text="9.5(토) 19:00 ∙ 홍대입구역 2번 출구 ∙ 무료" resource-id="com.friendscube.somoim:id/event_info" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[40,1291][1560,1338]" /></hierarchy>`;

test('evaluateSubmitOutcome: 사진 선택기가 폼을 덮은 것을 성공으로 읽지 않는다', () => {
  const outcome = evaluateSubmitOutcome(parseUiNodes(PHOTO_PICKER_XML));

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'foreign_window');
  assert.equal(outcome.packageName, 'com.android.providers.media.module');
});

test('evaluateSubmitOutcome: 제출 중 로딩 다이얼로그를 성공으로 읽지 않는다', () => {
  // 같은 패키지라 foreign_window로는 안 걸린다. 정모 게시글이 없으니 실패여야 한다.
  const outcome = evaluateSubmitOutcome(parseUiNodes(SUBMIT_LOADING_XML));

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'no_event_post');
});

test('evaluateSubmitOutcome: 폼이 그대로면 실패다', () => {
  const outcome = evaluateSubmitOutcome(parseUiNodes(CREATE_FORM_XML));

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'form_still_present');
});

test('evaluateSubmitOutcome: 빈 덤프는 확인 불가라 실패다', () => {
  assert.deepEqual(evaluateSubmitOutcome([]), { ok: false, reason: 'empty_screen' });
});

test('evaluateSubmitOutcome: 만들어진 정모 게시글이 보이면 성공이다', () => {
  const outcome = evaluateSubmitOutcome(parseUiNodes(CREATED_EVENT_XML), {
    title: '카페 스터디 테스트',
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.eventInfo, '9.5(토) 19:00 ∙ 홍대입구역 2번 출구 ∙ 무료');
});

test('evaluateSubmitOutcome: 남의 정모 게시글이면 제목이 달라 실패다', () => {
  const outcome = evaluateSubmitOutcome(parseUiNodes(CREATED_EVENT_XML), { title: '다른 정모' });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'title_mismatch');
  assert.equal(outcome.actual, '카페 스터디 테스트');
});

// 가로 모드 실기기에서 드러난 세 가지. 모두 "탭이 먹혔다고 가정"해서 생긴 문제라
// 좌표를 덤프에서 읽는 것만으로는 부족했다. 여기서는 그 사실을 문서처럼 고정해 둔다.
test('가로 모드에서도 좌표는 덤프에서 읽으므로 방향 자체는 문제가 아니다', () => {
  // rotation="3"(가로) 덤프도 같은 파서로 읽히고 center가 그대로 계산된다.
  const landscape = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="3"><node index="0" text="OK" resource-id="android:id/button1" class="android.widget.Button" package="com.friendscube.somoim" bounds="[1676,895][1804,1003]" /></hierarchy>`;
  const [ok] = parseUiNodes(landscape);

  assert.equal(ok.text, 'OK');
  assert.deepEqual(ok.center, { x: 1740, y: 949 });
});

test('buildScreenshotKey: 계약이 정한 스토리지 키 모양을 만든다', () => {
  assert.equal(
    buildScreenshotKey('11111111-1111-1111-1111-111111111111', 'before-submit'),
    'somoim-automation/11111111-1111-1111-1111-111111111111/before-submit.png',
  );
});

// 회귀 방지: job id 없이 키를 만들면 "somoim-automation/undefined/..."가 되어
// 서로 다른 job이 같은 키를 덮어쓴다. 실기기 dryRun에서 실제로 찍혀 나왔다.
test('buildScreenshotKey: job id가 없으면 키를 지어내지 않는다', () => {
  for (const missing of [undefined, null, '']) {
    assert.equal(buildScreenshotKey(missing, 'before-submit'), null);
  }
});

test('assertScheduledAtIsFuture: allows a date after "now"', () => {
  const now = Date.parse('2026-08-24T00:00:00.000Z');
  assert.doesNotThrow(() => assertScheduledAtIsFuture('2026-08-24T00:00:01.000Z', now));
});

test('assertScheduledAtIsFuture: rejects a date at or before "now" as a manual-review error', () => {
  const now = Date.parse('2026-08-24T00:00:00.000Z');

  for (const scheduledAt of ['2026-08-24T00:00:00.000Z', '2026-08-23T23:59:59.000Z']) {
    assert.throws(() => assertScheduledAtIsFuture(scheduledAt, now), (error) => {
      assert.equal(error.needsManualReview, true);
      assert.match(error.message, /already passed/);
      return true;
    });
  }
});

test('assertScheduledAtIsFuture: this is exactly the gap a stale-claim retry loop can fall into — a meetup at the 30-minute minimum lead time can still be mid-retry (up to staleClaimSeconds x maxAttempts) once its scheduledAt arrives', () => {
  const now = Date.now();
  const minLeadMs = 30 * 60 * 1000;
  const worstCaseRetryMs = 900 * 3 * 1000; // default staleClaimSeconds x default maxAttempts
  assert.ok(worstCaseRetryMs > minLeadMs, 'retry envelope must be able to outlast the minimum lead time for this test to be meaningful');

  const scheduledAt = new Date(now + minLeadMs).toISOString();
  const afterWorstCaseRetry = now + worstCaseRetryMs;
  assert.throws(() => assertScheduledAtIsFuture(scheduledAt, afterWorstCaseRetry));
});

// --- ADBKeyBoard 크래시 대응 (실기기에서 겪은 연쇄 실패) ---

test('typeText: 숫자는 IME를 거치지 않는다', async () => {
  const calls = [];
  const adb = { async shell(_id, args) { calls.push(args); return ''; } };

  await typeText(adb, 'dev', '7');
  await typeText(adb, 'dev', '30');

  // input text로 직접 넣는다. 시각 입력 중 ADBKeyBoard가 죽어 화면이 크래시
  // 다이얼로그로 덮였고, 그 뒤 job들이 줄줄이 "홈 화면 못 찾음"으로 실패했다.
  assert.deepEqual(calls, [['input', 'text', '7'], ['input', 'text', '30']]);
  assert.ok(!JSON.stringify(calls).includes('ADB_INPUT_TEXT'));
});

test('typeText: 한글은 IME 브로드캐스트로 보낸다', async () => {
  const calls = [];
  const adb = { async shell(_id, args) { calls.push(args); return ''; } };

  await typeText(adb, 'dev', '토요일 스터디');

  // input text로는 한글을 넣을 수 없으므로 이 경로는 그대로 둔다.
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /ADB_INPUT_TEXT/);
  assert.match(calls[0][0], /토요일 스터디/);
});

test('크래시 다이얼로그를 알아본다', () => {
  // 실기기 덤프 그대로: 우리 앱이 아니라 android 패키지가 띄운 창이라
  // force-stop으로는 사라지지 않는다.
  const nodes = parseUiNodes(`<hierarchy>
    <node resource-id="android:id/alertTitle" text="ADBKeyBoard has stopped" bounds="[0,0][100,50]" package="android"/>
    <node resource-id="android:id/aerr_app_info" text="App info" bounds="[0,60][100,110]" package="android"/>
    <node resource-id="android:id/aerr_close" text="Close app" bounds="[0,120][100,170]" package="android"/>
  </hierarchy>`);

  const button = findCrashDialogButton(nodes);
  assert.ok(button, '닫기 버튼을 찾아야 한다');
  assert.equal(button.resourceId, 'android:id/aerr_close');
});

test('평범한 화면을 크래시 다이얼로그로 오인하지 않는다', () => {
  const nodes = parseUiNodes(`<hierarchy>
    <node resource-id="com.friendscube.somoim:id/search_btn_layout" text="" bounds="[0,0][100,50]" package="com.friendscube.somoim"/>
  </hierarchy>`);

  assert.equal(findCrashDialogButton(nodes), null);
});

test('입력칸 비우기는 IME를 거치지 않는다', async () => {
  const calls = [];
  const adb = { async shell(_id, args) { calls.push(args); return ''; } };

  await clearFocusedField(adb, 'dev', '12');

  // ADB_CLEAR_TEXT는 쓰지 않는다. ADBKeyBoard가 getExtractedText()를 null 검사
  // 없이 읽어서, ExtractedText를 주지 않는 시간 선택기 칸에서 매번 죽었다.
  assert.ok(!JSON.stringify(calls).includes('ADB_CLEAR_TEXT'));
  assert.deepEqual(calls[0], ['input', 'keyevent', 'KEYCODE_MOVE_END']);
  // 기존 두 글자 + 여유 2회.
  assert.equal(calls[1].filter((key) => key === 'KEYCODE_DEL').length, 4);
});

test('입력칸 비우기: 현재 값을 몰라도 동작한다', async () => {
  const calls = [];
  const adb = { async shell(_id, args) { calls.push(args); return ''; } };

  await clearFocusedField(adb, 'dev');

  // 이미 빈 칸에 DEL을 더 보내도 해가 없다.
  assert.ok(calls[1].filter((key) => key === 'KEYCODE_DEL').length >= 1);
});

// --- 앱의 장소 칸 길이 제한 (실기기: 44자를 넣었더니 20자만 남았다) ---

test('장소가 짧으면 그대로 쓴다', () => {
  assert.equal(fitLocationForApp('강남역 스타벅스'), '강남역 스타벅스');
});

test('장소가 길면 괄호 앞 가게 이름만 남긴다', () => {
  // 그냥 20자에서 자르면 "아비아채 서울홍대점 (서울특별시 마포"가 되어 주소가
  // 중간에 끊긴다. 이름만 남기는 편이 짧으면서 알아보기 쉽다.
  assert.equal(
    fitLocationForApp('아비아채 서울홍대점 (서울특별시 마포구 와우산로37길 52 아비아채 서울홍대점)'),
    '아비아채 서울홍대점',
  );
});

test('가게 이름마저 길면 잘라서라도 넣는다', () => {
  const long = '가'.repeat(30);
  const fitted = fitLocationForApp(`${long} (서울시 어딘가)`);
  assert.equal(fitted.length, 20);
  assert.ok(long.startsWith(fitted));
});

test('괄호가 없는 긴 장소도 제한을 넘지 않는다', () => {
  const fitted = fitLocationForApp('서울특별시 마포구 와우산로37길 52 어딘가 아주 긴 장소 이름');
  assert.equal(fitted.length, 20);
});

test('빈 값이어도 터지지 않는다', () => {
  assert.equal(fitLocationForApp(''), '');
  assert.equal(fitLocationForApp(null), '');
});

test('참가비가 없으면 기본 문구를 넣는다', () => {
  // 앱이 경비를 필수로 받는다. 비우고 제출하면 "경비를 입력해 주세요." 토스트를
  // 띄우고 폼에 머문다 — 토스트는 덤프에 안 잡혀서 원인이 안 보인다(실기기 확인).
  assert.equal(costForApp({ cost: '' }), '각자 음료값');
  assert.equal(costForApp({}), '각자 음료값');
  assert.equal(costForApp({ cost: '   ' }), '각자 음료값');
});

test('참가비가 있으면 그대로 쓴다', () => {
  assert.equal(costForApp({ cost: '음료 5000원' }), '음료 5000원');
});

test('참가비는 항상 검증한다', () => {
  const expected = buildExpectedFieldValues(
    { title: '스터디', location: '카페', capacity: 6, cost: '' },
    { year: 2026, month: 8, day: 27, hour24: 11, minute: 0 },
  );

  // 늘 값이 들어가므로 hint("식사비 15000원")와 헷갈릴 일이 없다.
  assert.equal(expected.expense_edit, '각자 음료값');
  assert.equal(expected.name_edit, '스터디');
});

test('참가비가 있으면 그 값으로 검증한다', () => {
  const expected = buildExpectedFieldValues(
    { title: '스터디', location: '카페', capacity: 6, cost: '음료 5000원' },
    { year: 2026, month: 8, day: 27, hour24: 11, minute: 0 },
  );

  assert.equal(expected.expense_edit, '음료 5000원');
});

// --- 네이버 지도 URL (앱 칸은 100자에서 자른다: 130자 → 100자, 실기기 확인) ---

test('장소 이름으로 네이버 검색 URL을 만든다', () => {
  // 네이버 API는 필요 없다. payload의 장소 문자열만으로 만든다.
  assert.equal(
    buildNaverMapUrl('아비아채 서울홍대점 (서울특별시 마포구 와우산로37길 52 아비아채 서울홍대점)'),
    'https://map.naver.com/p/search/아비아채%20서울홍대점',
  );
});

test('한글은 퍼센트 인코딩하지 않는다', () => {
  // 한 글자가 9자(%EC%95%84)가 되어 100자 예산을 넘긴다. 같은 장소를 전체
  // 인코딩하면 115자라 잘린다.
  const url = buildNaverMapUrl('아비아채 서울홍대점');
  assert.ok(!url.includes('%EC'), '한글이 인코딩되면 안 된다');
  assert.ok(url.length <= 100);
});

test('공백은 인코딩한다', () => {
  // 공백이 그대로 있으면 URL로서 유효하지 않아 받는 쪽이 거부할 수 있다.
  const url = buildNaverMapUrl('강남역 스타벅스');
  assert.ok(!url.includes(' '), '날 공백이 남으면 안 된다');
  assert.match(url, /%20/);
});

test('100자를 넘으면 붙이지 않는다', () => {
  // 잘린 URL은 열리지 않는다. 지도 없이 올리는 편이 낫다.
  assert.equal(buildNaverMapUrl('가'.repeat(90)), null);
});

test('장소가 없으면 만들지 않는다', () => {
  assert.equal(buildNaverMapUrl(''), null);
  assert.equal(buildNaverMapUrl('   '), null);
});
