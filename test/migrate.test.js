import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrationChecksum, decideMigration } from '../scripts/migrate.js';

test('migrationChecksum: 같은 SQL은 같은 해시, 다르면 다른 해시', () => {
  const a = migrationChecksum('CREATE TABLE x (id int);');
  const b = migrationChecksum('CREATE TABLE x (id int);');
  const c = migrationChecksum('CREATE TABLE x (id bigint);');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/); // sha256 hex
});

test('decideMigration: 미적용이면 apply', () => {
  const sum = migrationChecksum('SELECT 1;');
  assert.deepEqual(decideMigration(null, sum, '001.sql'), { action: 'apply' });
});

test('decideMigration: 적용됐고 checksum 동일하면 skip', () => {
  const sum = migrationChecksum('SELECT 1;');
  assert.deepEqual(decideMigration({ checksum: sum }, sum, '001.sql'), { action: 'skip' });
});

test('decideMigration: 적용된 파일이 수정되면(checksum 불일치) error', () => {
  const oldSum = migrationChecksum('SELECT 1;');
  const newSum = migrationChecksum('SELECT 2;');
  const result = decideMigration({ checksum: oldSum }, newSum, '001.sql');
  assert.equal(result.action, 'error');
  assert.match(result.message, /수정되었습니다/);
  assert.match(result.message, /001\.sql/);
});

test('decideMigration: checksum 미기록(구버전 적용분)이면 skip (하위호환)', () => {
  // checksum 컬럼 추가 전에 적용된 마이그레이션은 checksum이 null.
  // 이 경우 drift 검사를 건너뛰고 skip (기존 배포 깨지지 않도록).
  const sum = migrationChecksum('SELECT 1;');
  assert.deepEqual(decideMigration({ checksum: null }, sum, '001.sql'), { action: 'skip' });
});
