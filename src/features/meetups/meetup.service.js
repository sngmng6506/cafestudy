import { createMeetupQueries } from './meetup.queries.js';
import { throwError, throwConflict } from '../../shared/errors.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';
import { MEETUP_LIMITS } from '../../../shared/domain-constraints.js';
import { normalizeKakaoPlaceId, normalizeKakaoPlaceUrl } from '../../shared/kakao-place.js';

export const MIN_LEAD_MS = MEETUP_LIMITS.minLeadMs;
export const MAX_CAPACITY = MEETUP_LIMITS.maxCapacity;

export function createMeetupService({ db, storage, hooks, queries = createMeetupQueries(db) }) {
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
      const meetup = await queries.createMeetup({
        ...input,
        // 사용자가 보낸 값이라 그대로 저장하지 않는다. 형식이 아니면 없는 것으로
        // 본다 — 장소 참조는 있으면 좋은 정보지 모임 생성의 조건은 아니다.
        placeId: normalizeKakaoPlaceId(input.placeId),
        placeUrl: normalizeKakaoPlaceUrl(input.placeUrl),
      });

      // 듣는 리스너가 없으면 자동 등록도 없다. 자동화가 꺼진 환경은 여기서 그대로 끝난다.
      const results = await (hooks?.emit?.('meetupCreated', meetup) ?? Promise.resolve([]));
      let somoimState = meetup.somoimState ?? 'none';
      const jobId = results.find((result) => result?.jobId)?.jobId ?? null;
      if (jobId) {
        const updated = await queries.setSomoimState({
          meetupId: meetup.id,
          state: 'pending',
          jobId,
        });
        somoimState = updated?.somoimState ?? 'pending';
      } else if (results.some((result) => result?.failed)) {
        // 리스너가 구독은 했지만(빈 배열이 아님) 입력을 거부한 경우다 — 자동화가
        // 꺼진 것과 구분해서 failed로 남긴다(예: 제목이 소모임 쪽 길이 제한을 넘음).
        const updated = await queries.setSomoimState({ meetupId: meetup.id, state: 'failed' });
        somoimState = updated?.somoimState ?? 'failed';
      }

      return {
        ...withLifecycleState(meetup),
        somoimState,
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
      if (result.outcome === 'somoim_pending') {
        throwError(400, 'MEETUP_SOMOIM_PENDING', '소모임에 등록하는 중이에요. 잠시 뒤에 참여할 수 있어요.');
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

      // 소모임 쪽 뒷정리는 듣는 쪽이 정한다 — 여기서는 취소했다는 사실만 알린다.
      // 아직 등록 전이면 큐의 job을 멈추는 것으로 끝나지만, 이미 등록된 뒤라면
      // 앱에 만들어진 정모를 지워야 한다. 그 판단에 필요한 상태와 제목·일시를
      // 함께 넘긴다(정모를 찾는 키다). 이걸 안 하면 웹에서 취소한 모임이 소모임엔
      // 그대로 남아, 멤버들은 취소된 줄 모르고 정모 페이지를 계속 본다.
      const results = await (hooks?.emit?.('meetupCancelled', meetup) ?? Promise.resolve([]));

      // 뒷정리가 거부되면(예: 제출 스위치가 꺼져 있다) 취소는 그대로 두고 이유만
      // 응답에 싣는다. 삼키면 소모임에 정모가 남았다는 사실이 아무 데도 안 남는다 —
      // 성공한 삭제는 job 큐에 기록이 남지만, 만들어지지도 못한 job은 흔적이 없다.
      const rejected = results.find((result) => result?.failed);
      return {
        meetupId,
        cancelled: true,
        somoimCleanup: rejected ? { requested: false, reason: rejected.reason } : null,
      };
    },

    async retrySomoimRegistration({ meetupId, userId }) {
      const meetup = await queries.getMeetupById(meetupId);
      if (!meetup) throwError(404, 'MEETUP_NOT_FOUND', '모임을 찾을 수 없습니다.');
      if (meetup.hostId !== userId) {
        throwError(403, 'NOT_MEETUP_HOST', '모임 개설자만 다시 시도할 수 있어요.');
      }
      if (meetup.somoimState !== 'failed') {
        throwError(400, 'MEETUP_SOMOIM_NOT_FAILED', '다시 시도할 수 있는 상태가 아니에요.');
      }

      // meetupCreated가 아니라 별도 이벤트를 쓴다 — meetupCreated 리스너는 autoRegister
      // 설정이 꺼지면 구독조차 안 되므로, 재시도를 그 위에 얹으면 allowSubmit만 켜둔
      // 상태에서 재시도가 조용히 죽는다(somoim-automation.hooks.js 참고).
      //
      // emit이 상태 쓰기보다 먼저 일어난다: 아래에서 경쟁에 지면(이미 다른 요청이
      // pending으로 바꿨다면) 이 job은 버려진 채로 큐에 남는다. 취소하지 않고 그대로 둔다 —
      // 하지만 무해하지 않다. 이 job은 나중에 worker에게 claim되어, 승자가 이미 만든
      // 소모임 정모와 별개로 중복 정모를 만들 수 있다. 보상 트랜잭션의 복잡도보다
      // 이 경합의 희귀함이 낫다고 판단해 감수하기로 한 비용이다(진행 계획 결정 기록 참고).
      const results = await (hooks?.emit?.('meetupSomoimRetryRequested', meetup) ?? Promise.resolve([]));
      const jobId = results.find((result) => result?.jobId)?.jobId ?? null;
      if (!jobId) {
        const rejected = results.find((result) => result?.failed);
        if (rejected) {
          // rejected.reason은 소모임 쪽 검증 메시지 그대로다(예: 제목 길이 초과,
          // scheduledAt이 이미 지남). feature 간 직접 import 없이 문구를 공유할 방법이
          // 없어 원문을 그대로 보여준다 — 실패한 자기 모임을 다시 시도하는 개설자만 본다.
          throwError(400, 'MEETUP_SOMOIM_REJECTED', rejected.reason || '지금 내용으로는 소모임에 등록할 수 없어요.');
        }
        throwError(503, 'SOMOIM_AUTOMATION_UNAVAILABLE', '지금은 소모임에 등록할 수 없어요.');
      }

      const updated = await queries.setSomoimState({
        meetupId,
        state: 'pending',
        jobId,
        expectedState: 'failed',
      });
      if (!updated) {
        throwConflict('MEETUP_SOMOIM_NOT_FAILED', '이미 다시 시도하고 있어요.');
      }
      return { meetupId, somoimState: updated.somoimState ?? 'pending' };
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
