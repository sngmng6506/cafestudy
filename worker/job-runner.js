import { ManualReviewError } from './errors.js';

// job 하나를 실행하고 서버에 보고할 결과를 만든다. 서버 호출과 분리해 두어
// 기기 없이도 안전장치와 실패 분기를 검증할 수 있다.
export async function runJob({
  job,
  handlers = {},
  allowSubmit = false,
  resolveDevice,
  // handler가 되돌릴 수 없는 제출 직전에 부른다. 서버에 시도를 기록해 두어야
  // 보고가 끊겨도 자동 재시도가 중복을 만들지 않는다.
  onBeforeSubmit,
}) {
  try {
    const handler = handlers[job?.type];
    if (!handler) {
      throw new ManualReviewError(`No handler for job type "${job?.type}"`);
    }

    const mode = resolveMode(job.payload, { allowSubmit });
    const deviceId = await resolveDevice();
    const result = await handler({
      payload: job.payload,
      deviceId,
      mode,
      jobId: job.id,
      onBeforeSubmit: onBeforeSubmit ? () => onBeforeSubmit(job.id) : undefined,
    });

    return {
      outcome: 'complete',
      result: { mode, deviceId, ...normalizeResult(result) },
    };
  } catch (error) {
    return {
      outcome: 'fail',
      errorMessage: error?.message || 'Unknown worker error',
      // 애매하면 true. TransientError만 명시적으로 false를 갖는다.
      needsManualReview: error?.needsManualReview !== false,
      result: normalizeResult(error?.details),
    };
  }
}

// 서버가 정규화해 보내지만 worker도 다시 확인한다. 이중 안전장치의 worker 절반이다.
export function resolveMode(payload = {}, { allowSubmit = false } = {}) {
  const dryRun = payload?.dryRun === true;
  const submit = payload?.submit === true;

  if (dryRun && !submit) return 'dryRun';
  if (!dryRun && submit) {
    if (!allowSubmit) {
      throw new ManualReviewError(
        'Final submit is disabled on this worker (set ALLOW_SOMOIM_SUBMIT=true to enable)',
      );
    }
    return 'submit';
  }

  throw new ManualReviewError(
    `Invalid dryRun/submit combination: dryRun=${dryRun}, submit=${submit}`,
  );
}

function normalizeResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}
