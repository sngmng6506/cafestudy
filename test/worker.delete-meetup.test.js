import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchEventCard } from '../worker/handlers/delete-meetup.js';
import { parseUiNodes } from '../worker/somoim-app.js';

// 클럽 홈 정기모임 섹션을 실기기에서 덤프한 모양. 카드마다 이름(name_text),
// 우상단 편집(edit_text_layout), 그리고 참석 토글(join_text)이 있다.
const EVENT_SECTION_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="3"><node index="0" text="정기모임" resource-id="com.friendscube.somoim:id/text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[40,861][164,911]" /><node index="1" text="33." resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[131,130][2428,174]" /><node index="2" text="" resource-id="com.friendscube.somoim:id/edit_text_layout" class="android.view.ViewGroup" package="com.friendscube.somoim" bounds="[2460,130][2528,174]" /><node index="3" text="참석" resource-id="com.friendscube.somoim:id/join_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[320,435][2528,511]" /><node index="4" text="자동화 삭제 테스트" resource-id="com.friendscube.somoim:id/name_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[131,573][2428,617]" /><node index="5" text="" resource-id="com.friendscube.somoim:id/edit_text_layout" class="android.view.ViewGroup" package="com.friendscube.somoim" bounds="[2460,573][2528,617]" /><node index="6" text="취소" resource-id="com.friendscube.somoim:id/join_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[320,912][2528,988]" /></hierarchy>`;

test('matchEventCard: 이름으로 카드를 찾고 같은 카드의 편집 버튼을 짝지어 준다', () => {
  const nodes = parseUiNodes(EVENT_SECTION_XML);
  const card = matchEventCard(nodes, '자동화 삭제 테스트');

  assert.ok(card);
  assert.equal(card.name.text, '자동화 삭제 테스트');
  // 위쪽 카드(33.)의 편집이 아니라 자기 카드의 편집이어야 한다. 잘못 짝지으면
  // 엉뚱한 정모를 지운다.
  assert.deepEqual(card.editButton.center, { x: 2494, y: 595 });
});

test('matchEventCard: 첫 카드도 자기 편집 버튼과 짝지어진다', () => {
  const card = matchEventCard(parseUiNodes(EVENT_SECTION_XML), '33.');

  assert.ok(card);
  assert.deepEqual(card.editButton.center, { x: 2494, y: 152 });
});

test('matchEventCard: 없는 이름이면 null이다', () => {
  assert.equal(matchEventCard(parseUiNodes(EVENT_SECTION_XML), '없는 정모'), null);
});

// 회귀 방지: 카드의 `취소`(join_text)는 삭제가 아니라 참석 취소다. 실기기에서
// 눌러 보면 "'…' 정모 참석을 취소하시겠습니까?"가 뜨고 정모는 그대로 남는다.
// 삭제 경로는 편집 → 정모 수정 → 정모 삭제하기다.
test('카드의 취소 버튼은 삭제 버튼이 아니다', () => {
  const nodes = parseUiNodes(EVENT_SECTION_XML);
  const cancel = nodes.find((n) => n.resourceId.endsWith('/join_text') && n.text === '취소');

  assert.ok(cancel, '참석 토글이 "취소"로 보이는 상황을 재현해야 의미가 있다');
  assert.equal(
    nodes.some((n) => n.resourceId.endsWith('/delete_button')),
    false,
    '정기모임 섹션에는 삭제 버튼이 없다 — 정모 수정 화면으로 들어가야 한다',
  );
});

// 정모 수정 화면. 삭제 전에 제목만이 아니라 일시까지 여기서 대조한다.
const EDIT_SCREEN_XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="3"><node index="0" text="정모 수정" resource-id="" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[136,107][280,160]" /><node index="1" text="자동화 삭제 테스트" resource-id="com.friendscube.somoim:id/name_edit" class="android.widget.EditText" package="com.friendscube.somoim" bounds="[40,222][2520,304]" /><node index="2" text="9월 5일 (토)" resource-id="com.friendscube.somoim:id/date_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[110,336][2314,418]" /><node index="3" text="오후 7:00" resource-id="com.friendscube.somoim:id/time_text" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[110,442][2314,524]" /><node index="4" text="정모 삭제하기" resource-id="com.friendscube.somoim:id/delete_button" class="android.widget.TextView" package="com.friendscube.somoim" bounds="[42,1140][226,1220]" /></hierarchy>`;

test('정모 수정 화면에서 제목과 일시를 모두 읽을 수 있다', () => {
  const nodes = parseUiNodes(EDIT_SCREEN_XML);
  const byId = (id) => nodes.find((n) => n.resourceId.endsWith(`/${id}`))?.text;

  assert.equal(nodes.some((n) => n.text === '정모 수정'), true);
  assert.equal(byId('name_edit'), '자동화 삭제 테스트');
  assert.equal(byId('date_text'), '9월 5일 (토)');
  assert.equal(byId('time_text'), '오후 7:00');
  assert.equal(byId('delete_button'), '정모 삭제하기');
});
