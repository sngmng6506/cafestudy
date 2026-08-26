import { AppError, throwConflict, throwNotFound, throwValidation } from '../../shared/errors.js';
import { createSomoimAutomationQueries } from './somoim-automation.queries.js';
import { SOMOIM_AUTOMATION_LIMITS } from '../../../shared/domain-constraints.js';
import { normalizeKakaoPlaceUrl } from '../../shared/kakao-place.js';

const JOB_TYPE_CREATE_MEETUP = 'create_meetup';
const JOB_TYPE_DELETE_MEETUP = 'delete_meetup';
const JOB_STATUSES = Object.freeze([
  'pending',
  'claimed',
  'succeeded',
  'failed',
  'needs_manual_review',
]);
const PAGE_LIMIT_MAX = 50;
const OFFSET_MAX = 100_000;
const DEFAULT_STALE_CLAIM_SECONDS = 900;
const DEFAULT_MAX_ATTEMPTS = 3;
const STALE_CLAIM_MESSAGE = 'Worker stopped responding before reporting a result';
// 제출을 시도한 뒤 보고가 끊긴 job. 자동 재시도는 정모를 하나 더 만들 수 있어
// 금지하고, 사람이 소모임 앱을 열어 실제로 생성됐는지 확인해야 한다.
const SUBMIT_ATTEMPTED_MESSAGE =
  'Worker attempted the final submit but never reported the result — check the somoim app for a created event before retrying';
const CANCELLED_MESSAGE = '모임이 취소되어 등록을 중단했어요';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = SOMOIM_AUTOMATION_LIMITS.meetupTitleMaxLength;
const MAX_LOCATION_LENGTH = SOMOIM_AUTOMATION_LIMITS.locationMaxLength;
const MAX_DESCRIPTION_LENGTH = SOMOIM_AUTOMATION_LIMITS.descriptionMaxLength;
const MAX_COST_LENGTH = SOMOIM_AUTOMATION_LIMITS.costMaxLength;
const MAX_CAPACITY = SOMOIM_AUTOMATION_LIMITS.maxCapacity;

export function createSomoimAutomationService({
  db,
  queries = createSomoimAutomationQueries(db),
  allowSubmit = false,
  staleClaimSeconds = DEFAULT_STALE_CLAIM_SECONDS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) {
  async function createMeetupJob({ requestedBy, input }) {
    assertUuid(requestedBy, 'requestedBy');
    const payload = normalizeMeetupPayload(input, { allowSubmit });
    return summarizeJob(await queries.createJob({ requestedBy, type: JOB_TYPE_CREATE_MEETUP, payload }));
  }

  // 소모임에 이미 만들어진 정모를 지우는 job. worker는 제목과 일시로 대상을 찾고,
  // 정모 수정 화면에서 둘 다 일치할 때만 지운다.
  //
  // 삭제도 create와 같은 이중 스위치를 쓴다. dryRun은 삭제 직전에 멈춘다.
  async function deleteMeetupJob({ requestedBy, input }) {
    assertUuid(requestedBy, 'requestedBy');
    const title = normalizeText(input?.title, 'title', MAX_TITLE_LENGTH);
    // 삭제는 미래 검증을 하지 않는다. 여기서 일시는 "언제 열 것인가"가 아니라
    // "어느 정모인가"를 가리키는 키다 — 지난 정모도 지울 수 있어야 한다.
    const scheduledAt = normalizeScheduledAt(input?.scheduledAt, { requireFuture: false });
    const submit = input?.submit === true;
    if (submit && !allowSubmit) {
      throwValidation('Final submit is disabled. Create a dry-run job first.');
    }
    const payload = { title, scheduledAt, dryRun: !submit, submit };
    return summarizeJob(await queries.createJob({ requestedBy, type: JOB_TYPE_DELETE_MEETUP, payload }));
  }

  return {
    createMeetupJob,
    deleteMeetupJob,

    // 웹 모임 생성 훅이 부른다. 개설자를 요청자로 남겨 관리자 화면에서 추적할 수 있게 한다.
    // 입력이 소모임 쪽 제약(제목/장소 길이 등)을 넘으면 여기서 실패를 값으로 돌려준다 —
    // emit이 예외를 삼키므로, 던지면 meetups는 이 실패를 전혀 알지 못하고 'none'으로 끝난다.
    async createJobForMeetup(meetup) {
      try {
        const { jobId } = await createMeetupJob({
          requestedBy: meetup.hostId,
          input: {
            title: meetup.title,
            scheduledAt: meetup.scheduledAt,
            location: meetup.location,
            capacity: meetup.capacity,
            description: meetup.description ?? '',
            cost: '',
            // 앱의 "지도 URL"에 넣을 장소 상세페이지. 검색 결과에서 고른 모임에만 있다.
            mapUrl: meetup.placeUrl ?? '',
            submit: true,
          },
        });
        return { jobId };
      } catch (err) {
        if (err instanceof AppError && err.code === 'VALIDATION_ERROR') {
          return { failed: true, reason: err.message };
        }
        throw err;
      }
    },

    // 이미 소모임에 등록된 모임이 웹에서 취소됐을 때 부른다. 앱에 만들어진 정모를
    // 지우는 job을 만든다. requestedBy는 호스트다 — 취소를 실행한 사람이 호스트이고
    // (라우트에서 검증한다), 큐에서 누구 때문에 생긴 삭제인지 추적할 수 있어야 한다.
    async deleteJobForMeetup(meetup) {
      try {
        const { jobId } = await deleteMeetupJob({
          requestedBy: meetup.hostId,
          input: { title: meetup.title, scheduledAt: meetup.scheduledAt, submit: true },
        });
        return { jobId };
      } catch (err) {
        // 취소 자체는 이미 커밋됐다. 삭제 job을 못 만들었다고 취소를 되돌리지는
        // 않는다 — 사용자가 요청한 건 취소이고, 소모임 정리는 뒷정리다.
        // 실패를 삼키지 않고 이유를 돌려주면 라우트가 응답에 실어 알릴 수 있다.
        if (err instanceof AppError && err.code === 'VALIDATION_ERROR') {
          return { failed: true, reason: err.message };
        }
        throw err;
      }
    },

    // job이 제출 버튼을 누르기 직전까지 갔는지. 눌렀다면 정모가 만들어졌을 수 있다 —
    // 실패로 끝났더라도 그렇다. 실기기에서 제출 직후 화면을 읽다가 adb가 깨져
    // job은 실패로 보고됐는데 정모는 남은 일이 있었다.
    async didAttemptSubmit(jobId) {
      assertUuid(jobId, 'jobId');
      const job = await queries.getJob(jobId);
      return Boolean(job?.submitAttemptedAt);
    },

    // 모임 취소 훅이 부른다. 아직 claim되지 않은 job만 중단된다.
    async cancelJobForMeetup(jobId) {
      assertUuid(jobId, 'jobId');
      return queries.cancelPendingJob({ id: jobId, errorMessage: CANCELLED_MESSAGE });
    },

    async listJobs({ status, limit = 20, offset = 0 } = {}) {
      const statuses = normalizeStatuses(status);
      if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT_MAX) {
        throwValidation(`limit must be an integer between 1 and ${PAGE_LIMIT_MAX}`);
      }
      if (!Number.isInteger(offset) || offset < 0 || offset > OFFSET_MAX) {
        throwValidation(`offset must be an integer between 0 and ${OFFSET_MAX}`);
      }

      // 한 건 더 읽어 다음 페이지 존재 여부를 판단한다(notices와 같은 방식).
      const rows = await queries.listJobs({ statuses, limit: limit + 1, offset });
      const items = rows.slice(0, limit);
      return {
        items,
        hasMore: rows.length > limit,
        nextOffset: offset + items.length,
      };
    },
    async getJob(id) {
      assertUuid(id, 'jobId');
      const job = await queries.getJob(id);
      if (!job) throwNotFound('JOB_NOT_FOUND', 'Automation job was not found');
      return job;
    },
    async claimNextJob() {
      // worker가 폴링할 때마다 회수한다. 별도 스케줄러 없이 필요한 시점에만 돈다.
      const recovered = await queries.requeueStaleJobs({
        staleAfterSeconds: staleClaimSeconds,
        maxAttempts,
        exhaustedMessage: STALE_CLAIM_MESSAGE,
        submitAttemptedMessage: SUBMIT_ATTEMPTED_MESSAGE,
      });
      // recovered는 SOMOIM_AUTOMATION.md가 문서화하고 worker가 읽는 필드라 개수 그대로 둔다.
      // exhausted는 그 중 사람에게 넘어간(재시도 소진) job만 추려, 라우트가 모임 쪽에
      // 실패를 알릴 수 있게 한다.
      //
      // 제출을 시도한 job은 여기서 제외한다. 모임을 failed로 내리면 개설자에게
      // "다시 시도" 버튼이 열리는데, 정모가 이미 만들어졌을 수 있어 누르면 중복이
      // 된다. 모임은 pending에 남겨 두고 사람이 job 목록을 보고 정리한다 —
      // pending에 갇히는 쪽이 실제 멤버들에게 보이는 중복 정모보다 낫다.
      const exhausted = recovered.filter(
        (row) => row.status === 'needs_manual_review' && !row.submitAttemptedAt,
      );
      return { job: await queries.claimNextJob(), recovered: recovered.length, exhausted };
    },

    // worker가 되돌릴 수 없는 제출을 하기 직전에 부른다. 이 호출이 실패하면 worker는
    // 제출하지 않고 물러난다 — 표시를 남기지 못한 채 누르면 중복을 막을 수 없다.
    async markSubmitAttempted(id) {
      assertUuid(id, 'jobId');
      const job = await queries.markSubmitAttempted(id);
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can attempt a submit');
      return job;
    },
    async completeJob({ id, result }) {
      assertUuid(id, 'jobId');
      const job = await queries.completeJob({ id, result: normalizeResult(result) });
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be completed');
      return job;
    },
    async failJob({ id, errorMessage, needsManualReview, result }) {
      assertUuid(id, 'jobId');
      // 재시도 여부와 무관하게 항상 요구한다 — 그래야 1~2번째 시도의 사유도
      // requeueJob에 남아 admin job 목록에서 마지막 실패 원인을 볼 수 있다.
      const normalizedErrorMessage = normalizeErrorMessage(errorMessage);
      const current = await queries.getJob(id);
      // 제출을 시도한 job은 worker가 "일시적 실패"라고 보고해도 다시 돌리지 않는다.
      // 앱에 정모가 이미 생겼는지 알 수 없으므로 재실행은 중복 위험이다.
      const canRetry = needsManualReview !== true
        && !current?.submitAttemptedAt
        && (current?.attempts ?? maxAttempts) < maxAttempts;

      if (canRetry) {
        const requeued = await queries.requeueJob(id, normalizedErrorMessage);
        if (!requeued) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be failed');
        return { ...requeued, requeued: true };
      }

      // 제출을 시도했다면 worker의 판단과 무관하게 사람 확인 대상이다. failed로
      // 두면 개설자에게 "다시 시도"가 열려 중복 정모를 만들 수 있다.
      const job = await queries.failJob({
        id,
        errorMessage: normalizedErrorMessage,
        needsManualReview: needsManualReview === true || Boolean(current?.submitAttemptedAt),
        result: normalizeResult(result),
      });
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be failed');
      return { ...job, requeued: false };
    },
  };
}

function normalizeMeetupPayload(input = {}, { allowSubmit }) {
  const title = normalizeText(input.title, 'title', MAX_TITLE_LENGTH);
  const location = normalizeText(input.location, 'location', MAX_LOCATION_LENGTH);
  const scheduledAt = normalizeScheduledAt(input.scheduledAt);
  const capacity = normalizeCapacity(input.capacity);
  const description = normalizeOptionalText(input.description, MAX_DESCRIPTION_LENGTH);
  const cost = normalizeOptionalText(input.cost, MAX_COST_LENGTH);
  // 저장할 때와 같은 규칙을 쓴다(shared/kakao-place.js). 규칙이 갈라지면
  // 저장은 되는데 정모에는 안 붙는 값이 조용히 생긴다.
  const mapUrl = normalizeKakaoPlaceUrl(input.mapUrl) ?? '';
  const submit = input.submit === true;
  if (submit && !allowSubmit) throwValidation('Final submit is disabled. Create a dry-run job first.');
  return { title, scheduledAt, location, capacity, description, cost, mapUrl, dryRun: !submit, submit };
}
function normalizeText(value, field, maxLength) {
  const text = (value ?? '').toString().replace(/\s+/g, ' ').trim();
  if (!text) throwValidation(`${field} is required`);
  if (text.length > maxLength) throwValidation(`${field} must be ${maxLength} characters or fewer`);
  return text;
}
function normalizeOptionalText(value, maxLength) {
  const text = (value ?? '').toString().replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length > maxLength) throwValidation(`text must be ${maxLength} characters or fewer`);
  return text;
}
// 모임 생성은 30분 최소 리드타임을 검사하지만(meetup.service.js), job은 그 뒤로도
// 큐 대기·stale-claim 재시도·호스트가 임의 시점에 누르는 재시도를 거칠 수 있어
// scheduledAt이 여기 도착할 때는 이미 지났을 수 있다. worker가 지난 시각으로 화면을
// 채우려 드는 걸 막기 위해 여기서도 다시 검사한다.
function normalizeScheduledAt(value, { requireFuture = true } = {}) {
  if (!value) throwValidation('scheduledAt is required');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throwValidation('scheduledAt must be a valid date');
  if (requireFuture && date.getTime() <= Date.now()) {
    throwValidation('scheduledAt must be in the future');
  }
  return date.toISOString();
}
function normalizeCapacity(value) {
  const capacity = Number(value ?? SOMOIM_AUTOMATION_LIMITS.defaultCapacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throwValidation(`capacity must be an integer between 1 and ${MAX_CAPACITY}`);
  }
  return capacity;
}
// 쉼표로 여러 상태를 받는다: status=pending,claimed 로 미완료 job만 볼 수 있다.
function normalizeStatuses(status) {
  if (status == null || status === '') return null;
  const statuses = [...new Set(
    String(status).split(',').map((value) => value.trim()).filter(Boolean),
  )];
  if (statuses.length === 0) return null;
  for (const value of statuses) {
    if (!JOB_STATUSES.includes(value)) {
      throwValidation(`status must be one of ${JOB_STATUSES.join(', ')}`);
    }
  }
  return statuses;
}

function normalizeResult(result) {
  if (result == null) return {};
  if (typeof result !== 'object' || Array.isArray(result)) throwValidation('result must be an object');
  return result;
}
function normalizeErrorMessage(value) {
  const message = (value ?? '').toString().replace(/\s+/g, ' ').trim();
  if (!message) throwValidation('errorMessage is required');
  return message.slice(0, 1000);
}
function assertUuid(value, field) {
  if (!UUID_PATTERN.test(value ?? '')) throwValidation(`${field} must be a valid UUID`);
}
function summarizeJob(job) {
  return { jobId: job.id, status: job.status, type: job.type, payload: job.payload, createdAt: job.createdAt };
}
