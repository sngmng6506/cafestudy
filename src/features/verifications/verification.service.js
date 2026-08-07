import crypto from 'node:crypto';
import { createVerificationQueries } from './verification.queries.js';
import { throwError, throwValidation, throwConflict } from '../../shared/errors.js';

const VERIFY_POINTS = 10;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVerificationService({ db, storage, config = {}, verificationQueries }) {
  const queries = verificationQueries ?? createVerificationQueries(db);
  const storageConfig = config.storage ?? {};
  const uploadTtlSeconds = storageConfig.uploadTtlSeconds ?? 300;
  const maxUploadBytes = storageConfig.verificationMaxBytes ?? 5 * 1024 * 1024;
  const maxPendingUploads = storageConfig.verificationMaxPending ?? 3;
  const maxUploadsPerHour = storageConfig.verificationMaxPerHour ?? 10;

  return {
    async createUploadUrl({ userId, meetupId, contentType, contentLength }) {
      if (!meetupId) throwValidation('meetupId is required');
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        throwValidation('jpeg, png, webp 이미지만 업로드할 수 있습니다.');
      }

      const size = Number(contentLength);
      if (!Number.isInteger(size) || size <= 0 || size > maxUploadBytes) {
        throwValidation(`사진 크기는 1바이트부터 ${maxUploadBytes}바이트 이하여야 합니다.`);
      }

      await ensureCanVerify(meetupId, userId);
      const uploadId = crypto.randomUUID();
      const objectKey = `verification-uploads/${userId}/${uploadId}${extensionFor(contentType)}`;
      const expiresAt = new Date(Date.now() + uploadTtlSeconds * 1000);
      const reserved = await queries.createUploadTicket({
        uploadId,
        userId,
        meetupId,
        objectKey,
        contentType,
        contentLength: size,
        expiresAt,
        maxPendingUploads,
        maxUploadsPerHour,
      });

      if (reserved.outcome === 'too_many_pending') {
        throwError(429, 'UPLOAD_PENDING_LIMIT', '진행 중인 사진 업로드가 너무 많아요. 잠시 후 다시 시도해 주세요.');
      }
      if (reserved.outcome === 'hourly_limit') {
        throwError(429, 'UPLOAD_RATE_LIMIT', '사진 업로드 요청이 너무 많아요. 한 시간 뒤 다시 시도해 주세요.');
      }

      try {
        const signed = await storage.createUploadUrl({
          objectKey,
          contentType,
          contentLength: size,
          expiresIn: uploadTtlSeconds,
        });
        return {
          uploadId,
          uploadUrl: signed.uploadUrl,
          expiresIn: signed.expiresIn,
          maxBytes: maxUploadBytes,
        };
      } catch (error) {
        await queries.failUploadTicket(uploadId, 'signing_failed').catch(() => {});
        throw error;
      }
    },

    async createVerification({ userId, meetupId, uploadId }) {
      if (!meetupId) throwValidation('meetupId is required');
      if (!UUID_PATTERN.test(uploadId ?? '')) throwValidation('유효한 uploadId가 필요합니다.');

      await ensureCanVerify(meetupId, userId);
      const ticket = await queries.claimUploadTicket({ uploadId, userId, meetupId });
      if (!ticket) {
        throwConflict('UPLOAD_NOT_AVAILABLE', '업로드가 만료됐거나 이미 사용되었습니다. 사진을 다시 업로드해 주세요.');
      }

      const finalObjectKey = `verifications/${meetupId}/${userId}/${uploadId}${extensionFor(ticket.contentType)}`;
      try {
        const object = await storage.readObject(ticket.objectKey, { maxBytes: maxUploadBytes });
        validateUploadedObject(ticket, object, maxUploadBytes);
        await storage.moveObject(ticket.objectKey, finalObjectKey);

        const verification = await queries.createVerificationWithPoints({
          userId,
          meetupId,
          uploadId,
          photoUrl: finalObjectKey,
          points: VERIFY_POINTS,
        });
        if (verification.outcome === 'upload_not_claimed') {
          throwConflict('UPLOAD_NOT_AVAILABLE', '업로드가 만료됐거나 이미 사용되었습니다.');
        }
        return verification;
      } catch (error) {
        await queries.failUploadTicket(uploadId, error.code ?? 'finalize_failed').catch(() => {});
        await Promise.allSettled([
          storage.deleteObject(ticket.objectKey),
          storage.deleteObject(finalObjectKey),
        ]);
        if (error.code === '23505') {
          throwConflict('DUPLICATE_VERIFICATION', '이미 인증한 모임입니다.');
        }
        throw error;
      }
    },

    async listMyVerifications(userId) {
      const rows = await queries.listByUser(userId);
      return Promise.all(rows.map(async (row) => ({
        ...row,
        photoViewUrl: await resolvePhotoUrl(row.photoUrl),
      })));
    },

    async listApprovedPhotos(userId, limit = 60) {
      const rows = await queries.listApprovedPhotos(userId, limit);
      return Promise.all(rows.map(async (row) => ({
        ...row,
        photoViewUrl: await resolvePhotoUrl(row.photoUrl),
      })));
    },
  };

  async function ensureCanVerify(meetupId, userId) {
    const meetup = await queries.getMeetupForVerify(meetupId);
    if (!meetup) throwError(404, 'MEETUP_NOT_FOUND', '모임을 찾을 수 없습니다.');

    const isParticipant = meetup.hostId === userId || (await queries.isParticipant(meetupId, userId));
    if (!isParticipant) {
      throwError(403, 'NOT_MEETUP_PARTICIPANT', '모임 참석자만 인증할 수 있습니다.');
    }
    if (new Date(meetup.scheduledAt).getTime() > Date.now()) {
      throwError(400, 'MEETUP_NOT_STARTED', '모임 시작 시간 이후에 인증할 수 있습니다.');
    }
  }

  async function resolvePhotoUrl(photoUrl) {
    if (!photoUrl || /^https?:\/\//i.test(photoUrl)) return null;
    try {
      return await storage.createDownloadUrl(photoUrl);
    } catch {
      return null;
    }
  }
}

export function validateUploadedObject(ticket, object, maxUploadBytes) {
  const actualType = normalizeContentType(object.contentType);
  if (actualType !== ticket.contentType) {
    throwValidation('업로드한 파일 형식이 요청한 이미지 형식과 다릅니다.');
  }
  if (
    !Number.isInteger(object.contentLength) ||
    object.contentLength <= 0 ||
    object.contentLength > maxUploadBytes ||
    object.contentLength !== ticket.contentLength
  ) {
    throwValidation('업로드한 사진 크기가 요청 정보와 다릅니다. 사진을 다시 선택해 주세요.');
  }
  if (!matchesImageSignature(object.body, ticket.contentType)) {
    throwValidation('실제 이미지 파일만 인증 사진으로 사용할 수 있습니다.');
  }
}

export function matchesImageSignature(body, contentType) {
  if (!Buffer.isBuffer(body)) return false;
  if (contentType === 'image/jpeg') {
    return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function normalizeContentType(value) {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}

function extensionFor(contentType) {
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  return '.jpg';
}
