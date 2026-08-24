import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canJoin, somoimBadge } from '../client/src/shared/somoim-registration.js';

test('등록 중과 실패만 배지를 단다', () => {
  assert.equal(somoimBadge('none'), null);
  assert.equal(somoimBadge('registered'), null);
  assert.deepEqual(somoimBadge('pending'), { label: '소모임 등록 중', tone: 'ui-text-muted' });
  assert.deepEqual(somoimBadge('failed'), { label: '소모임 등록 실패', tone: 'ui-text-danger' });
});

test('등록이 끝나기 전에는 참가할 수 없다', () => {
  assert.equal(canJoin('none'), true);
  assert.equal(canJoin('registered'), true);
  assert.equal(canJoin('pending'), false);
  assert.equal(canJoin('failed'), false);
});

test('모르는 상태는 막지 않는다', () => {
  assert.equal(canJoin('brand_new'), true, '서버가 새 상태를 보내도 화면이 멈추면 안 된다');
  assert.equal(somoimBadge('brand_new'), null);
});
