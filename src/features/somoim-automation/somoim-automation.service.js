import { throwConflict, throwNotFound, throwValidation } from '../../shared/errors.js';
import { createSomoimAutomationQueries } from './somoim-automation.queries.js';
import { SOMOIM_AUTOMATION_LIMITS } from '../../../shared/domain-constraints.js';

const JOB_TYPE_CREATE_MEETUP = 'create_meetup';
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

  return {
    createMeetupJob,

    // 웹 모임 생성 훅이 부른다. 개설자를 요청자로 남겨 관리자 화면에서 추적할 수 있게 한다.
    async createJobForMeetup(meetup) {
      const { jobId } = await createMeetupJob({
        requestedBy: meetup.hostId,
        input: {
          title: meetup.title,
          scheduledAt: meetup.scheduledAt,
          location: meetup.location,
          capacity: meetup.capacity,
          description: meetup.description ?? '',
          cost: '',
          submit: true,
        },
      });
      return { jobId };
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
      });
      return { job: await queries.claimNextJob(), recovered: recovered.length };
    },
    async completeJob({ id, result }) {
      assertUuid(id, 'jobId');
      const job = await queries.completeJob({ id, result: normalizeResult(result) });
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be completed');
      return job;
    },
    async failJob({ id, errorMessage, needsManualReview, result }) {
      assertUuid(id, 'jobId');
      const current = await queries.getJob(id);
      const canRetry = needsManualReview !== true
        && (current?.attempts ?? maxAttempts) < maxAttempts;

      if (canRetry) {
        const requeued = await queries.requeueJob(id);
        if (!requeued) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be failed');
        return { ...requeued, requeued: true };
      }

      const job = await queries.failJob({
        id,
        errorMessage: normalizeErrorMessage(errorMessage),
        needsManualReview: needsManualReview === true,
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
  const submit = input.submit === true;
  if (submit && !allowSubmit) throwValidation('Final submit is disabled. Create a dry-run job first.');
  return { title, scheduledAt, location, capacity, description, cost, dryRun: !submit, submit };
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
function normalizeScheduledAt(value) {
  if (!value) throwValidation('scheduledAt is required');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throwValidation('scheduledAt must be a valid date');
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
