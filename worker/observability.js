const SERVICE = 'somoim-worker';

export function createWorkerLogger({ write = (line) => console.log(line), now = () => new Date() } = {}) {
  return (level, event, fields = {}) => {
    write(JSON.stringify({
      ...fields,
      timestamp: now().toISOString(),
      level,
      service: SERVICE,
      event,
    }));
  };
}

export function normalizeJobFailure({ job, outcome, reportedJob } = {}) {
  const result = outcome?.result ?? {};
  const message = outcome?.errorMessage || 'Unknown worker error';
  const stage = result.stage || 'unknown';

  return {
    jobId: job?.id,
    jobType: job?.type,
    stage,
    attempt: reportedJob?.attempts ?? job?.attempts,
    errorCode: classifyError({ stage, message }),
    message,
    retryable: reportedJob?.requeued === true,
    needsManualReview: outcome?.needsManualReview === true,
    submitAttempted: Boolean(
      reportedJob?.submitAttemptedAt
      ?? job?.submitAttemptedAt
      ?? job?.submitAttempted,
    ),
  };
}

export function normalizeWorkerFailure(event, error) {
  return {
    errorCode: event === 'worker_start_failed' ? 'WORKER_START_FAILED' : 'WORKER_RUNTIME_ERROR',
    message: error?.message || 'Unknown worker error',
  };
}

function classifyError({ stage, message }) {
  const text = `${stage} ${message}`.toLowerCase();
  const rules = [
    ['DEVICE_UNAUTHORIZED', /unauthori[sz]ed/],
    ['DEVICE_TIMEZONE_INVALID', /timezone|time zone/],
    ['DEVICE_UNAVAILABLE', /device|adb|offline|no devices?/],
    ['APP_LOGIN_REQUIRED', /login|로그인/],
    ['TARGET_GROUP_NOT_FOUND', /target.group|group.not.found|클럽.*찾/],
    ['FORM_VALUE_MISMATCH', /mismatch|불일치/],
    ['FORM_FIELD_NOT_FOUND', /field|selector|요소.*찾/],
    ['MEETUP_CANCELLED', /cancel/],
    ['DUPLICATE_EVENT_FOUND', /duplicate|중복/],
    ['SUBMIT_INTENT_FAILED', /submit.intent|mark.submit/],
    ['EVENT_CREATION_UNCONFIRMED', /creat.*unconfirm|creation.*confirm/],
    ['EVENT_DELETE_UNCONFIRMED', /delet.*unconfirm|deletion.*confirm/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'WORKER_JOB_FAILED';
}
