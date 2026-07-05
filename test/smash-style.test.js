import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smashStyleVars } from '../client/src/shared/smash-style.js';

test('smashStyleVars: 같은 시드는 같은 파괴 패턴 (전 사용자 동일 보장)', () => {
  const a = smashStyleVars('2026-07-05T10:00:00Z');
  const b = smashStyleVars('2026-07-05T10:00:00Z');
  assert.deepEqual(a, b);
});

test('smashStyleVars: 시드가 다르면 패턴도 달라진다 (깨부술 때마다 새 랜덤)', () => {
  const a = smashStyleVars('2026-07-05T10:00:00Z');
  const b = smashStyleVars('2026-07-05T10:00:01Z');
  assert.notDeepEqual(a, b);
});

test('smashStyleVars: 값들이 CSS에서 쓸 수 있는 범위 안에 있다', () => {
  const vars = smashStyleVars('seed');

  const hue = Number.parseInt(vars['--sm-hue'], 10);
  assert.ok(hue >= 60 && hue <= 300, `hue out of range: ${hue}`);

  const sat = Number.parseFloat(vars['--sm-sat']);
  assert.ok(sat >= 0.8 && sat <= 1.9, `sat out of range: ${sat}`);

  for (let i = 1; i <= 10; i += 1) {
    const rot = Number.parseFloat(vars[`--sm-r${i}`]);
    assert.ok(Math.abs(rot) <= 5.2, `rotation out of range: ${rot}`);
    const x = Number.parseFloat(vars[`--sm-x${i}`]);
    assert.ok(Math.abs(x) <= 12, `x out of range: ${x}`);
  }
});
