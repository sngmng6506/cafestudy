import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('API uses same-origin cookies and never sends a local bearer token', async () => {
  setCurrentUserState('user-1', '테스터', 'legacy-secret', 'member');
  let init;
  globalThis.fetch = async (_path, options) => {
    init = options;
    return jsonResponse({ data: { ok: true }, error: null });
  };
  await apiFetch('/api/test');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(new Headers(init.headers).has('Authorization'), false);
  assert.equal(localStorage.getItem('cafestudy_token'), null);
  assert.equal(useCurrentUser().currentToken.value, 'cookie');
});

test('API forwards keepalive for unload-safe state persistence', async () => {
  let init;
  globalThis.fetch = async (_path, options) => {
    init = options;
    return jsonResponse({ data: { saved: true }, error: null });
  };
  await apiFetch('/api/game2048/state', { method: 'PUT', keepalive: true });
  assert.equal(init.keepalive, true);
});

test('401 clears stored and reactive session markers', async () => {
  setCurrentUserState('user-1', '테스터', '', 'admin');
  globalThis.fetch = async () => jsonResponse({
    data: null,
    error: { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' },
  }, 401);
  await assert.rejects(() => apiFetch('/api/auth/me'));
  assert.equal(useCurrentUser().currentUserId.value, '');
  assert.equal(useCurrentUser().currentToken.value, '');
  assert.equal(localStorage.getItem('cafestudy_has_session'), null);
});

test('request timeout returns a stable error code', async () => {
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  await assert.rejects(
    () => apiFetch('/api/slow', { timeoutMs: 5 }),
    (error) => error.code === 'REQUEST_TIMEOUT' && error.status === 0,
  );
});
