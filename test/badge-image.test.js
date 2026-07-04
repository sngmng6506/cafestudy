import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachBadgeImageUrls } from '../src/shared/badge-image.js';

function storageStub(calls) {
  return {
    createDownloadUrl: async (objectKey) => {
      calls.push(objectKey);
      return `signed:${objectKey}`;
    },
  };
}

test('attachBadgeImageUrls replaces the object key with a signed url', async () => {
  const calls = [];
  const rows = await attachBadgeImageUrls(storageStub(calls), [
    { id: 'u1', activeBadgeObjectKey: 'badges/a.png' },
    { id: 'u2', activeBadgeObjectKey: null },
  ]);

  assert.deepEqual(rows, [
    { id: 'u1', activeBadgeImageUrl: 'signed:badges/a.png' },
    { id: 'u2', activeBadgeImageUrl: null },
  ]);
});

test('attachBadgeImageUrls signs each distinct key once', async () => {
  const calls = [];
  await attachBadgeImageUrls(storageStub(calls), [
    { id: 'u1', activeBadgeObjectKey: 'badges/a.png' },
    { id: 'u2', activeBadgeObjectKey: 'badges/a.png' },
    { id: 'u3', activeBadgeObjectKey: 'badges/b.png' },
  ]);

  assert.deepEqual(calls.sort(), ['badges/a.png', 'badges/b.png']);
});

test('attachBadgeImageUrls supports custom field names and empty input', async () => {
  const calls = [];
  const rows = await attachBadgeImageUrls(
    storageStub(calls),
    [{ name: '민수', badgeKey: 'badges/c.png' }],
    { keyField: 'badgeKey', urlField: 'badgeUrl' },
  );

  assert.deepEqual(rows, [{ name: '민수', badgeUrl: 'signed:badges/c.png' }]);
  assert.deepEqual(await attachBadgeImageUrls(storageStub(calls), null), []);
});
