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

// handler가 실패와 함께 넘기는 stage에서 코드를 정한다. 메시지 문장으로 추측하지
// 않는다 — 문구는 자주 다듬어지는데 정규식은 그때마다 조용히 빗나가고, 알림이 전부
// 하나의 코드로 뭉친다. stage는 어휘가 정해져 있어 바뀌면 눈에 띈다.
//
// 코드는 Discord 알림의 중복 제거 키(jobId:errorCode)에도 쓰이므로, 서로 다른 원인이
// 같은 코드로 합쳐지지 않는 정도까지 나눈다.
const STAGE_CODES = Object.freeze({
  validate_payload: 'PAYLOAD_INVALID',
  validate_mode: 'PAYLOAD_INVALID',
  validate_device: 'DEVICE_UNAVAILABLE',
  launch: 'APP_LAUNCH_FAILED',
  open_my_groups: 'APP_NAVIGATION_FAILED',
  open_group_page: 'TARGET_GROUP_NOT_FOUND',
  open_create_form: 'APP_NAVIGATION_FAILED',
  open_edit: 'APP_NAVIGATION_FAILED',
  set_date: 'FORM_DATE_FAILED',
  set_time: 'FORM_TIME_FAILED',
  fill_form: 'FORM_FIELD_NOT_FOUND',
  set_notice: 'FORM_NOTICE_FAILED',
  attach_photo: 'PHOTO_ATTACH_FAILED',
  attach_map: 'MAP_ATTACH_FAILED',
  verify_form: 'FORM_VALUE_MISMATCH',
  verify_target: 'DELETE_TARGET_MISMATCH',
  find_event: 'EVENT_NOT_FOUND',
  submit: 'EVENT_CREATION_UNCONFIRMED',
  delete: 'EVENT_DELETE_UNCONFIRMED',
});

// stage가 없는 실패도 있다. adb 명령 자체가 깨지거나 기기가 사라진 경우인데,
// 그때는 남는 단서가 메시지뿐이라 여기서만 문장을 본다.
const MESSAGE_CODES = Object.freeze([
  ['DEVICE_UNAUTHORIZED', /unauthori[sz]ed/],
  ['DEVICE_TIMEZONE_INVALID', /timezone|time zone/],
  ['DEVICE_UNAVAILABLE', /\badb\b|device is (?:offline|unauthorized)|no android device/],
]);

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

export function classifyError({ stage, message = '' }) {
  const fromStage = STAGE_CODES[stage];
  if (fromStage) return fromStage;

  const text = message.toLowerCase();
  return MESSAGE_CODES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'WORKER_JOB_FAILED';
}
