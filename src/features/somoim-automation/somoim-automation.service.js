import { throwConflict, throwNotFound, throwValidation } from '../../shared/errors.js';
import { createSomoimAutomationQueries } from './somoim-automation.queries.js';
import { SOMOIM_AUTOMATION_LIMITS } from '../../../shared/domain-constraints.js';

const JOB_TYPE_CREATE_MEETUP = 'create_meetup';
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
} = {}) {
  return {
    async createMeetupJob({ requestedBy, input }) {
      assertUuid(requestedBy, 'requestedBy');
      const payload = normalizeMeetupPayload(input, { allowSubmit });
      return summarizeJob(await queries.createJob({ requestedBy, type: JOB_TYPE_CREATE_MEETUP, payload }));
    },
    async getJob(id) {
      assertUuid(id, 'jobId');
      const job = await queries.getJob(id);
      if (!job) throwNotFound('JOB_NOT_FOUND', 'Automation job was not found');
      return job;
    },
    async claimNextJob() { return { job: await queries.claimNextJob() }; },
    async completeJob({ id, result }) {
      assertUuid(id, 'jobId');
      const job = await queries.completeJob({ id, result: normalizeResult(result) });
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be completed');
      return job;
    },
    async failJob({ id, errorMessage, needsManualReview, result }) {
      assertUuid(id, 'jobId');
      const job = await queries.failJob({
        id,
        errorMessage: normalizeErrorMessage(errorMessage),
        needsManualReview: needsManualReview === true,
        result: normalizeResult(result),
      });
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be failed');
      return job;
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
