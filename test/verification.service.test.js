import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVerificationService } from '../src/features/verifications/verification.service.js';

const HOST = 'host-1';
const OTHER = 'other-2';

// db stub: getMeetupHost returns the configured host (or none); transaction
// returns a fake verification row.
function serviceWith({ hostId }) {
  const db = {
    query: async () => ({ rows: hostId ? [{ hostId }] : [] }),
    transaction: async (callback) => callback({ query: async () => ({ rows: [{ id: 'v1' }] }) }),
  };
  const storage = {
    createUploadUrl: async () => ({ uploadUrl: 'u', objectKey: 'k', photoUrl: 'p' }),
  };
  return createVerificationService({ db, storage });
}

test('createVerification rejects a non-host with 403', async () => {
  const service = serviceWith({ hostId: HOST });

  await assert.rejects(
    () => service.createVerification({ userId: OTHER, meetupId: 'm1', photoUrl: 'p' }),
    (err) => err.statusCode === 403 && err.code === 'NOT_MEETUP_HOST',
  );
});

test('createVerification allows the meetup host', async () => {
  const service = serviceWith({ hostId: HOST });

  const result = await service.createVerification({ userId: HOST, meetupId: 'm1', photoUrl: 'p' });
  assert.equal(result.id, 'v1');
});

test('createUploadUrl also enforces host-only', async () => {
  const service = serviceWith({ hostId: HOST });

  await assert.rejects(
    () => service.createUploadUrl({ userId: OTHER, meetupId: 'm1', contentType: 'image/jpeg' }),
    (err) => err.statusCode === 403 && err.code === 'NOT_MEETUP_HOST',
  );
});

test('createVerification returns 404 when the meetup does not exist', async () => {
  const service = serviceWith({ hostId: null });

  await assert.rejects(
    () => service.createVerification({ userId: HOST, meetupId: 'missing', photoUrl: 'p' }),
    (err) => err.statusCode === 404 && err.code === 'MEETUP_NOT_FOUND',
  );
});
