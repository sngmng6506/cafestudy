import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createVerificationService,
  matchesImageSignature,
} from '../src/features/verifications/verification.service.js';

const HOST = '00000000-0000-0000-0000-000000000001';
const MEETUP = '00000000-0000-0000-0000-000000000002';
const UPLOAD = '00000000-0000-0000-0000-000000000003';
const PAST = new Date(Date.now() - 60_000).toISOString();

function jpeg() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function serviceWith({ imageBody = jpeg(), ticket = null, meetup = {} } = {}) {
  const tickets = new Map();
  if (ticket) tickets.set(ticket.id, { ...ticket });
  const calls = { move: [], deleted: [], created: [] };
  const queries = {
    async getMeetupForVerify() {
      return { hostId: HOST, scheduledAt: PAST, status: 'open', ...meetup };
    },
    async isParticipant() { return true; },
    async createUploadTicket(input) {
      tickets.set(input.uploadId, {
        id: input.uploadId,
        objectKey: input.objectKey,
        contentType: input.contentType,
        contentLength: input.contentLength,
        status: 'pending',
      });
      return { outcome: 'created' };
    },
    async failUploadTicket(id) {
      const row = tickets.get(id);
      if (row) row.status = 'failed';
    },
    async claimUploadTicket({ uploadId }) {
      const row = tickets.get(uploadId);
      if (!row || row.status !== 'pending') return null;
      row.status = 'finalizing';
      return row;
    },
    async createVerificationWithPoints(input) {
      calls.created.push(input);
      const row = tickets.get(input.uploadId);
      if (!row || row.status !== 'finalizing') return { outcome: 'upload_not_claimed' };
      row.status = 'consumed';
      return { id: 'verification-1', ...input };
    },
    async listByUser() { return []; },
    async listApprovedPhotos() { return []; },
  };
  const storage = {
    async createUploadUrl(input) { return { uploadUrl: 'https://upload.test', expiresIn: input.expiresIn }; },
    async readObject(objectKey) {
      const row = [...tickets.values()].find((candidate) => candidate.objectKey === objectKey);
      return {
        contentType: row?.contentType ?? 'image/jpeg',
        contentLength: imageBody.length,
        body: imageBody,
      };
    },
    async moveObject(source, destination) { calls.move.push([source, destination]); },
    async deleteObject(key) { calls.deleted.push(key); },
    async createDownloadUrl(key) { return `signed:${key}`; },
  };
  return {
    service: createVerificationService({
      storage,
      verificationQueries: queries,
      config: {
        storage: {
          uploadTtlSeconds: 300,
          verificationMaxBytes: 1024,
          verificationMaxPending: 3,
          verificationMaxPerHour: 10,
        },
      },
    }),
    tickets,
    calls,
  };
}

test('upload URL reserves an opaque upload id and does not expose a photo URL', async () => {
  const { service, tickets } = serviceWith();
  const result = await service.createUploadUrl({
    userId: HOST,
    meetupId: MEETUP,
    contentType: 'image/jpeg',
    contentLength: 6,
  });
  assert.match(result.uploadId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.photoUrl, undefined);
  assert.equal(tickets.get(result.uploadId).contentLength, 6);
});

test('upload URL rejects missing or oversized content length', async () => {
  const { service } = serviceWith();
  for (const contentLength of [0, 1025]) {
    await assert.rejects(
      () => service.createUploadUrl({
        userId: HOST,
        meetupId: MEETUP,
        contentType: 'image/jpeg',
        contentLength,
      }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  }
});

test('closed meetup rejects both upload reservation and verification finalization', async () => {
  const { service } = serviceWith({ meetup: { status: 'closed' } });
  await assert.rejects(
    () => service.createUploadUrl({
      userId: HOST,
      meetupId: MEETUP,
      contentType: 'image/jpeg',
      contentLength: 6,
    }),
    (error) => error.code === 'MEETUP_CLOSED',
  );
  await assert.rejects(
    () => service.createVerification({ userId: HOST, meetupId: MEETUP, uploadId: UPLOAD }),
    (error) => error.code === 'MEETUP_CLOSED',
  );
});

test('verification cannot be created from a client supplied URL', async () => {
  const { service } = serviceWith();
  await assert.rejects(
    () => service.createVerification({
      userId: HOST,
      meetupId: MEETUP,
      photoUrl: 'https://tracker.example/pixel',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('verification validates actual image bytes before awarding points', async () => {
  const objectKey = `verification-uploads/${HOST}/${UPLOAD}.jpg`;
  const { service, tickets, calls } = serviceWith({
    imageBody: Buffer.from('not an image'),
    ticket: {
      id: UPLOAD,
      objectKey,
      contentType: 'image/jpeg',
      contentLength: 12,
      status: 'pending',
    },
  });
  await assert.rejects(
    () => service.createVerification({ userId: HOST, meetupId: MEETUP, uploadId: UPLOAD }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(tickets.get(UPLOAD).status, 'failed');
  assert.equal(calls.created.length, 0);
});

test('valid reserved upload is moved to the trusted final prefix and consumed once', async () => {
  const body = jpeg();
  const objectKey = `verification-uploads/${HOST}/${UPLOAD}.jpg`;
  const { service, tickets, calls } = serviceWith({
    imageBody: body,
    ticket: {
      id: UPLOAD,
      objectKey,
      contentType: 'image/jpeg',
      contentLength: body.length,
      status: 'pending',
    },
  });
  const result = await service.createVerification({ userId: HOST, meetupId: MEETUP, uploadId: UPLOAD });
  assert.equal(result.id, 'verification-1');
  assert.equal(tickets.get(UPLOAD).status, 'consumed');
  assert.equal(calls.move.length, 1);
  assert.match(calls.move[0][1], new RegExp(`^verifications/${MEETUP}/${HOST}/`));

  await assert.rejects(
    () => service.createVerification({ userId: HOST, meetupId: MEETUP, uploadId: UPLOAD }),
    (error) => error.code === 'UPLOAD_NOT_AVAILABLE',
  );
});

test('image signature detection covers the accepted formats', () => {
  assert.equal(matchesImageSignature(jpeg(), 'image/jpeg'), true);
  assert.equal(matchesImageSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(matchesImageSignature(Buffer.from('RIFF0000WEBP'), 'image/webp'), true);
  assert.equal(matchesImageSignature(Buffer.from('fake'), 'image/jpeg'), false);
});
