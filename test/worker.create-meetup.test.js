import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertScheduledAtIsFuture,
  buildScreenshotKey,
  findByResourceId,
  isCreateFormPresent,
  formatEnglishHeader,
  formatKoreanDate,
  formatKoreanTime,
  monthsBetween,
  parseEnglishHeaderDate,
  parseUiNodes,
  to12Hour,
  toKstParts,
  uniqueByBounds,
} from '../worker/handlers/create-meetup.js';

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
