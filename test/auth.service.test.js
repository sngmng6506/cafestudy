import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthService } from '../src/features/auth/auth.service.js';
import { hashPassword, verifyPassword } from '../src/features/auth/auth.util.js';

const MEMBER = 'member-1';

// 인메모리 users/sessions 를 흉내내는 queries 스텁.
function stubQueries({ users = {} } = {}) {
  const sessions = new Map();
  const state = { users: { ...users }, sessions };
  return {
    state,
    queries: {
      async getAuthUserById(id) {
        return state.users[id] ?? null;
      },
      async setPassword(id, hash) {
        state.users[id].passwordHash = hash;
      },
      async clearPassword(id) {
        state.users[id].passwordHash = null;
        for (const [token, uid] of sessions) if (uid === id) sessions.delete(token);
      },
      async insertSession(token, userId) {
        sessions.set(token, userId);
      },
      async deleteSession(token) {
        sessions.delete(token);
      },
    },
  };
}

test('hashPassword/verifyPassword round-trips and rejects wrong password', () => {
  const stored = hashPassword('secret');
  assert.equal(verifyPassword('secret', stored), true);
  assert.equal(verifyPassword('nope', stored), false);
});

test('setPassword sets the hash and issues a session', async () => {
  const { state, queries } = stubQueries({
    users: { [MEMBER]: { id: MEMBER, nickname: '홍길동', passwordHash: null, isAdmin: false } },
  });
  const service = createAuthService(queries);

  const { token, user } = await service.setPassword({ memberId: MEMBER, password: 'pw123' });
  assert.ok(token);
  assert.equal(user.name, '홍길동');
  assert.ok(state.users[MEMBER].passwordHash);
  assert.equal(state.sessions.get(token), MEMBER);
});

test('setPassword rejects when a password is already set', async () => {
  const { queries } = stubQueries({
    users: { [MEMBER]: { id: MEMBER, nickname: '홍길동', passwordHash: hashPassword('pw'), isAdmin: false } },
  });
  const service = createAuthService(queries);

  await assert.rejects(
    () => service.setPassword({ memberId: MEMBER, password: 'newpw' }),
    (err) => err.statusCode === 409 && err.code === 'PASSWORD_ALREADY_SET',
  );
});

test('login succeeds with the correct password and fails with a wrong one', async () => {
  const { queries } = stubQueries({
    users: { [MEMBER]: { id: MEMBER, nickname: '홍길동', passwordHash: hashPassword('pw123'), isAdmin: false } },
  });
  const service = createAuthService(queries);

  const { token } = await service.login({ memberId: MEMBER, password: 'pw123' });
  assert.ok(token);

  await assert.rejects(
    () => service.login({ memberId: MEMBER, password: 'wrong' }),
    (err) => err.statusCode === 403 && err.code === 'INVALID_PASSWORD',
  );
});

test('login fails with PASSWORD_NOT_SET when no password exists', async () => {
  const { queries } = stubQueries({
    users: { [MEMBER]: { id: MEMBER, nickname: '홍길동', passwordHash: null, isAdmin: false } },
  });
  const service = createAuthService(queries);

  await assert.rejects(
    () => service.login({ memberId: MEMBER, password: 'anything' }),
    (err) => err.statusCode === 403 && err.code === 'PASSWORD_NOT_SET',
  );
});

test('resetPassword clears the hash and invalidates existing sessions', async () => {
  const { state, queries } = stubQueries({
    users: { [MEMBER]: { id: MEMBER, nickname: '홍길동', passwordHash: hashPassword('pw123'), isAdmin: false } },
  });
  const service = createAuthService(queries);

  const { token } = await service.login({ memberId: MEMBER, password: 'pw123' });
  assert.equal(state.sessions.get(token), MEMBER);

  await service.resetPassword({ targetMemberId: MEMBER });
  assert.equal(state.users[MEMBER].passwordHash, null);
  assert.equal(state.sessions.has(token), false);

  // 초기화 후에는 다시 최초 설정 흐름으로 유도된다.
  await assert.rejects(
    () => service.login({ memberId: MEMBER, password: 'pw123' }),
    (err) => err.code === 'PASSWORD_NOT_SET',
  );
});
