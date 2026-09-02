import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

function source(relativePath) {
  return readFileSync(path.join(...relativePath.split('/')), 'utf8');
}

const semanticCss = source('client/src/semantic-tokens.css');
const overlaySource = source('client/src/shared/useOverlay.js');

test('모션 유틸리티는 semantic token과 reduced motion을 함께 사용한다', () => {
  for (const className of [
    '.ui-transition-colors',
    '.ui-pressable',
    '.ui-modal-enter-active',
    '.ui-sheet-enter-active',
    '.ui-popover-enter-active',
  ]) {
    assert.match(semanticCss, new RegExp(className.replace('.', '\\.')));
  }

  assert.match(semanticCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(semanticCss, /transition:\s*all\b/);
});

test('공통 overlay는 focus, Escape, 스크롤 잠금과 중첩 순서를 관리한다', () => {
  assert.match(overlaySource, /FOCUSABLE_SELECTOR/);
  assert.match(overlaySource, /event\.key === 'Escape'/);
  assert.match(overlaySource, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(overlaySource, /overlayStack\.at\(-1\)/);
  assert.match(overlaySource, /previousFocus\.focus/);
});

test('모달과 시트가 공통 접근성 동작을 사용한다', () => {
  const components = [
    'client/src/shared/CreateMeetupDialog.vue',
    'client/src/shared/MemberSelectModal.vue',
    'client/src/features/cafes/CafeDetailSheet.vue',
    'client/src/features/members/MemberProfileCard.vue',
    'client/src/features/menu-search/MenuSearchSheet.vue',
  ];

  for (const component of components) {
    const contents = source(component);
    assert.match(contents, /useOverlay\(/, `${component}에 공통 overlay 동작이 필요하다`);
    assert.match(contents, /role="dialog"/, `${component}에 dialog 역할이 필요하다`);
    assert.match(contents, /aria-modal="true"/, `${component}에 modal 상태가 필요하다`);
    assert.match(contents, /tabindex="-1"/, `${component}의 패널이 초기 포커스를 받을 수 있어야 한다`);
  }
});

test('일반 UI에 금지된 transition-all과 고정 높이 accordion이 없다', () => {
  const components = [
    'client/src/shared/ToastContainer.vue',
    'client/src/features/home/HomePage.vue',
    'client/src/features/ranking/RankingPage.vue',
  ];
  const combined = components.map(source).join('\n');

  assert.doesNotMatch(combined, /transition-all|transition:\s*all\b/);
  assert.doesNotMatch(combined, /maxHeight:\s*infoOpen|900px/);
  assert.match(source('client/src/features/home/HomePage.vue'), /aria-expanded="infoOpen"/);
});

test('셸은 모임 만들기 게이트가 사용하는 로그인 안내 함수를 노출한다', () => {
  const appShell = source('client/src/shared/useAppShell.js');
  const returnBlock = [...appShell.matchAll(/return \{([\s\S]*?)\n  \};/g)].at(-1)?.[1] ?? '';
  assert.match(returnBlock, /\brequireLogin,/, '게스트가 모임 만들기를 누를 때 로그인 모달을 열 수 있어야 한다');
});

test('핵심 아이콘 버튼은 44px보다 작은 터치 영역을 사용하지 않는다', () => {
  const touchCritical = [
    'client/src/App.vue',
    'client/src/shared/NotificationBell.vue',
    'client/src/shared/RefreshSomoimButton.vue',
    'client/src/shared/MeetupCard.vue',
    'client/src/features/home/HomePage.vue',
    'client/src/features/ranking/RankingPage.vue',
    'client/src/features/badges/BadgesPage.vue',
  ].map(source).join('\n');

  assert.doesNotMatch(touchCritical, /focus-ring[^\n]*h-(?:8|9|10) w-(?:8|9|10)/);
});
