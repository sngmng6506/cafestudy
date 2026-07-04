import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeAngle,
  snapTarget,
  apexIndex,
  itemAngle,
} from '../client/src/shared/wheel-math.js';

test('normalizeAngle: [-180, 180) 범위로 접는다', () => {
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(370), 10);
  assert.equal(normalizeAngle(-190), 170);
  assert.equal(normalizeAngle(180), -180);
  assert.equal(normalizeAngle(-180), -180);
  assert.equal(normalizeAngle(720), 0);
});

test('snapTarget: 가장 가까운 항목 정렬 각도로 스냅한다', () => {
  assert.equal(snapTarget(0, 36), 0);
  assert.equal(snapTarget(17, 36), 0);   // 절반(18) 미만 → 제자리
  assert.equal(snapTarget(19, 36), 36);  // 절반 초과 → 다음 칸
  assert.equal(snapTarget(-19, 36), -36);
  assert.equal(snapTarget(360 + 19, 36), 360 + 36); // 누적 회전 유지
});

test('apexIndex: 정점(12시)에 온 항목 인덱스', () => {
  assert.equal(apexIndex(0, 36, 10), 0);
  assert.equal(apexIndex(-36, 36, 10), 1);  // 반시계로 한 칸 → 다음 항목
  assert.equal(apexIndex(36, 36, 10), 9);   // 시계로 한 칸 → 마지막 항목
  assert.equal(apexIndex(-360 - 36, 36, 10), 1); // 한 바퀴 돌아도 동일
  assert.equal(apexIndex(-17, 36, 10), 0);  // 스냅 전 어중간한 각도도 근사
});

test('itemAngle: 항목의 화면 각도', () => {
  assert.equal(itemAngle(0, 0, 36), 0);
  assert.equal(itemAngle(1, 0, 36), 36);
  assert.equal(itemAngle(9, 0, 36), -36); // 36*9=324 → -36으로 접힘
  assert.equal(itemAngle(1, -36, 36), 0);
});
