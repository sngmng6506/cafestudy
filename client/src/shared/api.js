import { clearCurrentUserState, STORAGE_KEY, STORAGE_TOKEN_KEY } from './useCurrentUser.js';

const DEFAULT_TIMEOUT_MS = 15_000;

function combineAbortSignals(signals) {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(activeSignals);

  const controller = new AbortController();
  const abort = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort(signal);
      break;
    }
    signal.addEventListener('abort', () => abort(signal), { once: true });
  }

  return controller.signal;
}

export async function apiFetch(path, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    headers: optionHeaders,
    ...fetchOptions
  } = options;
  const userId = localStorage.getItem(STORAGE_KEY);
  const token = localStorage.getItem(STORAGE_TOKEN_KEY);
  const headers = new Headers(optionHeaders ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // dev 폴백 및 최초 로그인 전 개인화 읽기를 위해 병행 전송 (서버는 토큰을 우선한다).
  if (userId) headers.set('x-user-id', userId);

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);
  const signal = combineAbortSignals([callerSignal, timeoutController.signal]);

  let response;
  try {
    response = await fetch(path, { ...fetchOptions, headers, signal });
  } catch (error) {
    if (timeoutController.signal.aborted && !callerSignal?.aborted) {
      const timeoutError = new Error('요청 시간이 초과되었습니다.');
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`서버 오류 (${response.status})`);
  }

  const body = await response.json();

  if (!response.ok || body.error) {
    // 세션 만료/무효: 저장소와 Vue 반응 상태를 함께 지워 모든 화면을 즉시 로그아웃 상태로 맞춘다.
    if (response.status === 401) clearCurrentUserState();

    const error = new Error(body.error?.message ?? '요청에 실패했습니다.');
    error.code = body.error?.code;
    error.status = response.status;
    error.requestId = body.error?.requestId ?? response.headers.get('x-request-id');
    throw error;
  }

  return body;
}
