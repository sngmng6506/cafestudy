import { createVerificationQueries } from './verification.queries.js';

const VERIFY_POINTS = 10;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function createVerificationService({ db, storage }) {
  const queries = createVerificationQueries(db);

  return {
    async createUploadUrl({ userId, meetupId, contentType }) {
      if (!meetupId) {
        throwValidationError('meetupId is required');
      }

      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        throwValidationError('Only jpeg, png, and webp images are allowed');
      }

      await ensureCanVerify(meetupId, userId);

      return storage.createUploadUrl({
        prefix: `verifications/${meetupId}/${userId}`,
        contentType,
      });
    },

    async createVerification({ userId, meetupId, photoUrl }) {
      if (!meetupId) {
        throwValidationError('meetupId is required');
      }

      if (!photoUrl) {
        throwValidationError('photoUrl is required');
      }

      await ensureCanVerify(meetupId, userId);

      try {
        return await queries.createVerificationWithPoints({
          userId,
          meetupId,
          photoUrl,
          points: VERIFY_POINTS,
        });
      } catch (error) {
        if (error.code === '23505') {
          const conflict = new Error('이미 인증한 모임입니다.');
          conflict.statusCode = 409;
          conflict.code = 'DUPLICATE_VERIFICATION';
          throw conflict;
        }

        throw error;
      }
    },

    async listMyVerifications(userId) {
      const rows = await queries.listByUser(userId);
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          photoViewUrl: await resolvePhotoUrl(row.photoUrl),
        })),
      );
    },
  };

  // Only the host may verify, and only once the meetup has started.
  async function ensureCanVerify(meetupId, userId) {
    const meetup = await queries.getMeetupForVerify(meetupId);

    if (!meetup) {
      throwError(404, 'MEETUP_NOT_FOUND', '모임을 찾을 수 없습니다.');
    }
    if (meetup.hostId !== userId) {
      throwError(403, 'NOT_MEETUP_HOST', '모임 개설자만 인증할 수 있습니다.');
    }
    if (new Date(meetup.scheduledAt).getTime() > Date.now()) {
      throwError(400, 'MEETUP_NOT_STARTED', '모임 시작 시간 이후에 인증할 수 있습니다.');
    }
  }

  async function resolvePhotoUrl(photoUrl) {
    if (!photoUrl) return null;
    if (/^https?:\/\//.test(photoUrl)) return photoUrl;

    try {
      return await storage.createDownloadUrl(photoUrl);
    } catch {
      return null;
    }
  }
}

function throwValidationError(message) {
  throwError(400, 'VALIDATION_ERROR', message);
}

function throwError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}
