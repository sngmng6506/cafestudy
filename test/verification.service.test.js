import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVerificationService } from '../src/features/verifications/verification.service.js';

const HOST = 'host-1';
const OTHER = 'other-2';
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function serviceWith({ hostId, scheduledAt = PAST, participantIds = [], verifications = [], onQuery = () => {} }) {
  const db = {
    query: async (sql, params = []) => {
      onQuery(sql, params);
      if (sql.includes('FROM verifications')) return { rows: verifications };
      if (sql.includes('FROM participants')) {
        return { rows: participantIds.includes(params[1]) ? [{ '?column?': 1 }] : [] };
      }
      if (sql.includes('FROM meetups')) return { rows: hostId ? [{ hostId, scheduledAt }] : [] };
      return { rows: [] };
    },
    transaction: async (callback) => callback({ query: async () => ({ rows: [{ id: 'v1' }] }) }),
  };
  const storage = {
    createUploadUrl: async () => ({ uploadUrl: 'u', objectKey: 'k', photoUrl: 'p' }),
    createDownloadUrl: async () => 'https://signed.example/photo.jpg',
  };
  return createVerificationService({ db, storage });
}

test('createVerification rejects a non-participant with 403', async () => {
  const service = serviceWith({ hostId: HOST });

  await assert.rejects(
    () => service.createVerification({ userId: OTHER, meetupId: 'm1', photoUrl: 'p' }),
    (err) => err.statusCode === 403 && err.code === 'NOT_MEETUP_PARTICIPANT',
  );
});

test('createVerification rejects a meetup that has not started yet', async () => {
  const service = serviceWith({ hostId: HOST, scheduledAt: FUTURE });

  await assert.rejects(
    () => service.createVerification({ userId: HOST, meetupId: 'm1', photoUrl: 'p' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_NOT_STARTED',
  );
});

test('createVerification allows the host once the meetup has started', async () => {
  const service = serviceWith({ hostId: HOST, scheduledAt: PAST });

  const result = await service.createVerification({ userId: HOST, meetupId: 'm1', photoUrl: 'p' });
  assert.equal(result.id, 'v1');
});

test('createVerification allows a participant once the meetup has started', async () => {
  const service = serviceWith({ hostId: HOST, scheduledAt: PAST, participantIds: [OTHER] });

  const result = await service.createVerification({ userId: OTHER, meetupId: 'm1', photoUrl: 'p' });
  assert.equal(result.id, 'v1');
});

test('createUploadUrl also enforces participant + started', async () => {
  const service = serviceWith({ hostId: HOST, scheduledAt: FUTURE });

  await assert.rejects(
    () => service.createUploadUrl({ userId: HOST, meetupId: 'm1', contentType: 'image/jpeg' }),
    (err) => err.statusCode === 400 && err.code === 'MEETUP_NOT_STARTED',
  );
});

test('createVerification returns 404 when the meetup is missing', async () => {
  const service = serviceWith({ hostId: null });

  await assert.rejects(
    () => service.createVerification({ userId: HOST, meetupId: 'missing', photoUrl: 'p' }),
    (err) => err.statusCode === 404 && err.code === 'MEETUP_NOT_FOUND',
  );
});

test('listMyVerifications attaches a viewable photo URL', async () => {
  const service = serviceWith({
    hostId: HOST,
    verifications: [{ id: 'v1', meetupId: 'm1', photoUrl: 'verifications/m1/u/x.jpg', meetupTitle: '스터디' }],
  });

  const list = await service.listMyVerifications(HOST);
  assert.equal(list.length, 1);
  assert.equal(list[0].photoViewUrl, 'https://signed.example/photo.jpg');
});

test('listApprovedPhotos scopes photos to the requesting user', async () => {
  let verificationQueryParams;
  const service = serviceWith({
    hostId: HOST,
    verifications: [{ id: 'v1', meetupId: 'm1', photoUrl: 'verifications/m1/u/x.jpg', meetupTitle: 'study' }],
    onQuery: (sql, params) => {
      if (sql.includes('FROM verifications')) verificationQueryParams = params;
    },
  });

  const list = await service.listApprovedPhotos(OTHER);
  assert.deepEqual(verificationQueryParams, [OTHER, 60]);
  assert.equal(list.length, 1);
  assert.equal(list[0].photoViewUrl, 'https://signed.example/photo.jpg');
});
