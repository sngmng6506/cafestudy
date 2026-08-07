import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  clear() {
    this.#values.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

let apiFetch;
let setCurrentUserState;
let useCurrentUser;
let originalFetch;

before(async () => {
  originalFetch = globalThis.fetch;
  ({ apiFetch } = await import('../client/src/shared/api.js'));
  ({ setCurrentUserState, useCurrentUser } = await import('../client/src/shared/useCurrentUser.js'));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
  useCurrentUser().clearCurrentUser();
});

function jsonResponse(body, { status = 200, requestId } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (requestId) headers.set('x-request-id', requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

test('401 clears stored and reactive authentication state', async () => {
  setCurrentUserState('user-1', '테스터', 'expired-token', 'admin');
  globalThis.fetch = async () => jsonResponse({
    data: null,
    error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' },
  }, { status: 401 });

  await assert.rejects(
    () => apiFetch('/api/auth/me'),
    (error) => error.status === 401 && error.code === 'AUTH_REQUIRED',
  );

  const currentUser = useCurrentUser();
  assert.equal(currentUser.currentUserId.value, '');
  assert.equal(currentUser.currentUserName.value, '');
  assert.equal(currentUser.currentToken.value, '');
  assert.equal(currentUser.adminRole.value, 'member');
  assert.equal(localStorage.getItem('cafestudy_user_id'), null);
  assert.equal(localStorage.getItem('cafestudy_token'), null);
  assert.equal(localStorage.getItem('cafestudy_admin_role'), null);
});

test('server errors preserve the current session and request id', async () => {
  setCurrentUserState('user-2', '유지됨', 'valid-token', 'member');
  globalThis.fetch = async () => jsonResponse({
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: '서버에서 오류가 발생했습니다.',
      requestId: 'request-500',
    },
  }, { status: 500, requestId: 'request-500' });

  await assert.rejects(
    () => apiFetch('/api/failure'),
    (error) => error.status === 500 && error.requestId === 'request-500',
  );

  assert.equal(useCurrentUser().currentUserId.value, 'user-2');
  assert.equal(useCurrentUser().currentToken.value, 'valid-token');
});

test('request timeout aborts fetch with a stable error code', async () => {
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  await assert.rejects(
    () => apiFetch('/api/slow', { timeoutMs: 5 }),
    (error) => error.code === 'REQUEST_TIMEOUT' && error.status === 0,
  );
});

test('caller cancellation is not reported as a timeout', async () => {
  const controller = new AbortController();
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  const request = apiFetch('/api/cancelled', {
    signal: controller.signal,
    timeoutMs: 1_000,
  });
  controller.abort(new DOMException('Cancelled by caller', 'AbortError'));

  await assert.rejects(
    () => request,
    (error) => error.name === 'AbortError' && error.code !== 'REQUEST_TIMEOUT',
  );
});
