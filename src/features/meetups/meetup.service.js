import { createMeetupQueries } from './meetup.queries.js';
import { throwError } from '../../shared/errors.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';
import { MEETUP_LIMITS } from '../../../shared/domain-constraints.js';

export const MIN_LEAD_MS = MEETUP_LIMITS.minLeadMs;
export const MAX_CAPACITY = MEETUP_LIMITS.maxCapacity;

export function createMeetupService({ db, storage }) {
  const queries = createMeetupQueries(db);

  return {
    async listMeetups(userId) {
      const meetups = await queries.listMeetups(userId);
      return Promise.all(
        meetups.map(async (meetup) => ({
          ...withLifecycleState(meetup),
          attendees: await attachBadgeImageUrls(storage, meetup.attendees, {
            keyField: 'badgeKey',
            urlField: 'badgeUrl',
          }),
        })),
      );
    },

    async createMeetup(input) {
      validateMeetupInput(input);
      const meetup = await queries.createMeetup(input);
      return {
        ...withLifecycleState(meetup),
        participantCount: 1,
        joined: true,
        isHost: true,
      };
    },

    async joinMeetup({ meetupId, userId }) {
      const result = await queries.joinMeetup({ meetupId, userId });
      if (result.outcome === 'not_found') {
        throwError(404, 'MEETUP_NOT_FOUND', '모임을 찾을 수 없습니다.');
      }
      if (result.outcome === 'closed') {
        throwError(400, 'MEETUP_CLOSED', '참여할 수 없는 모임입니다.');
      }
      if (result.outcome === 'full') {
        throwError(400, 'MEETUP_FULL', '참가 정원이 가득 찼습니다.');
      }
      return { meetupId, joined: true, participantCount: result.participantCount };
    },

    async cancelMeetup({ meetupId, userId }) {
      const meetup = await queries.getMeetupById(meetupId);
      if (!meetup) {
        throwError(404, 'MEETUP_NOT_FOUND', '모임을 찾을 수 없습니다.');
      }
      if (meetup.hostId !== userId) {
        throwError(403, 'NOT_MEETUP_HOST', '모임 개설자만 취소할 수 있습니다.');
      }

      await queries.cancelMeetup(meetupId);
      return { meetupId, cancelled: true };
    },

    async leaveMeetup({ meetupId, userId }) {
      const meetup = await queries.getMeetupById(meetupId);
      if (meetup && deriveLifecycleState(meetup.scheduledAt) === 'done') {
        throwError(400, 'MEETUP_CLOSED', '이미 종료된 모임입니다.');
      }
      if (meetup && meetup.hostId === userId) {
        throwError(400, 'HOST_CANNOT_LEAVE', '모임 개설자는 참여를 취소할 수 없습니다.');
      }

      await queries.removeParticipant(meetupId, userId);
      const participantCount = await queries.countParticipants(meetupId);
      return { meetupId, joined: false, participantCount };
    },
  };
}

export function deriveLifecycleState(scheduledAt, now = Date.now()) {
  return new Date(scheduledAt).getTime() <= now ? 'done' : 'upcoming';
}

// Temporary compatibility export for callers migrating from the ambiguous name.
export const deriveState = deriveLifecycleState;

function withLifecycleState(meetup) {
  const lifecycleState = deriveLifecycleState(meetup.scheduledAt);
  return {
    ...meetup,
    lifecycleState,
    // Deprecated compatibility field. Remove after all clients consume lifecycleState.
    state: lifecycleState,
  };
}

function validateMeetupInput(input) {
  const requiredFields = ['hostId', 'title', 'location', 'scheduledAt'];
  for (const field of requiredFields) {
    if (!input[field]) {
      throwError(400, 'VALIDATION_ERROR', `${field} is required`);
    }
  }

  const scheduled = new Date(input.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    throwError(400, 'VALIDATION_ERROR', 'scheduledAt 형식이 올바르지 않습니다.');
  }
  if (scheduled.getTime() < Date.now() + MIN_LEAD_MS) {
    throwError(400, 'VALIDATION_ERROR', '모임은 지금부터 30분 이후 시간으로만 개설할 수 있습니다.');
  }

  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throwError(400, 'VALIDATION_ERROR', `최대 참가 인원은 1~${MAX_CAPACITY} 사이로 설정해주세요.`);
  }
}
