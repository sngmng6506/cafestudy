import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// features/index.js를 그대로 import하면 .vue 컴포넌트까지 딸려와 node에서 못 읽는다.
// 등록 줄만 파싱해 플래그를 확인한다.
const source = readFileSync(path.join('client', 'src', 'features', 'index.js'), 'utf8');

function registeredFeatures() {
  return [...source.matchAll(/\{ name: '([^']+)'[^}]*\}/g)].map((match) => ({
    name: match[1],
    memberOnly: /memberOnly: true/.test(match[0]),
    adminOnly: /adminOnly: true/.test(match[0]),
  }));
}

// 로그인해야만 내용이 생기는 화면. 서버 라우트가 requireUser로 막고 있는 기능들이다.
const NEEDS_LOGIN = ['verifications', 'notices', 'badges', 'settlements'];
// 비로그인으로도 읽을 수 있는 화면. 서버가 인증 없이 응답하는 기능들이다.
const OPEN_TO_GUESTS = ['home', 'meetups', 'ranking', 'members', 'cafes', 'meetup-history'];

test('로그인이 필요한 화면은 모두 memberOnly로 잠근다', () => {
  const features = registeredFeatures();
  for (const name of NEEDS_LOGIN) {
    const feature = features.find((item) => item.name === name);
    assert.ok(feature, `${name} 기능이 등록되어 있어야 한다`);
    assert.equal(feature.memberOnly, true, `${name}은 게스트에게 잠겨야 한다`);
  }
});

test('공개 화면에는 잠금을 걸지 않는다', () => {
  const features = registeredFeatures();
  for (const name of OPEN_TO_GUESTS) {
    const feature = features.find((item) => item.name === name);
    assert.ok(feature, `${name} 기능이 등록되어 있어야 한다`);
    assert.equal(feature.memberOnly, false, `${name}은 둘러보기로 볼 수 있어야 한다`);
  }
});

test('관리자 전용 화면은 잠금 플래그와 무관하게 게스트에게 보이지 않는다', () => {
  const admin = registeredFeatures().find((item) => item.name === 'admin');
  assert.equal(admin.adminOnly, true, 'adminOnly가 게스트 노출을 먼저 차단한다');
});

test('모든 기능은 잠금 여부가 명시적으로 결정되어 있다', () => {
  const known = new Set([...NEEDS_LOGIN, ...OPEN_TO_GUESTS, 'admin']);
  const undecided = registeredFeatures()
    .map((feature) => feature.name)
    .filter((name) => !known.has(name));

  // 새 기능을 추가하면 이 목록 중 하나에 넣어 게스트 노출을 의식적으로 정하게 한다.
  assert.deepEqual(undecided, ['dice', 'game2048', 'updates', 'search-guide', 'qr'],
    '새 기능이 생기면 게스트에게 보일지 결정하고 이 테스트를 갱신한다');
});
