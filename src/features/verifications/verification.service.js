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

      await ensureHost(meetupId, userId);

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

      await ensureHost(meetupId, userId);

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
  };

  // Only the meetup's host may verify it.
  async function ensureHost(meetupId, userId) {
    const meetup = await queries.getMeetupHost(meetupId);

    if (!meetup) {
      const error = new Error('모임을 찾을 수 없습니다.');
      error.statusCode = 404;
      error.code = 'MEETUP_NOT_FOUND';
      throw error;
    }

    if (meetup.hostId !== userId) {
      const error = new Error('모임 개설자만 인증할 수 있습니다.');
      error.statusCode = 403;
      error.code = 'NOT_MEETUP_HOST';
      throw error;
    }
  }
}

function throwValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  throw error;
}
