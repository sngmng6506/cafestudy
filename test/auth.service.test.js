import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthService } from '../src/features/auth/auth.service.js';
import { hashOpaqueToken, hashPassword, verifyPassword } from '../src/features/auth/auth.util.js';

const MEMBER = 'member-1';
const ADMIN = 'admin-1';
const OWNER = 'owner-1';

function stubQueries({ users = {} } = {}) {
  const sessions = new Map();
  const setupTokens = new Map();
  const state = { users: structuredClone(users), sessions, setupTokens };
  return {
    state,
    queries: {
      async getAuthUserById(id) { return state.users[id] ?? null; },
      async setInitialPassword(id, passwordHash) {
        const target = state.users[id];
        if (!target || target.passwordHash || target.passwordUpdatedAt) return false;
        target.passwordHash = passwordHash;
        target.passwordUpdatedAt = new Date();
        return true;
      },
      async consumeSetupToken({ userId, tokenHash, passwordHash }) {
        const token = setupTokens.get(tokenHash);
        if (!token || token.userId !== userId || token.used || token.expiresAt <= Date.now()) return false;
        token.used = true;
        state.users[userId].passwordHash = passwordHash;
        state.users[userId].passwordUpdatedAt = new Date();
        return true;
      },
      async createPasswordSetupToken({ userId, createdBy, tokenHash, expiresAt }) {
        for (const [key, token] of setupTokens) {
          if (token.userId === userId) setupTokens.delete(key);
        }
        state.users[userId].passwordHash = null;
        state.users[userId].passwordUpdatedAt = new Date();
        for (const [tokenHashKey, uid] of sessions) {
          if (uid === userId) sessions.delete(tokenHashKey);
        }
        setupTokens.set(tokenHash, {
          userId,
          createdBy,
          expiresAt: expiresAt.getTime(),
          used: false,
        });
      },
      async insertSession(tokenHash, userId) { sessions.set(tokenHash, userId); },
      async deleteSession(tokenHash) { sessions.delete(tokenHash); },
    },
  };
}

function user(id, name, role, password = null) {
  return {
    id,
    nickname: name,
    adminRole: role,
    passwordHash: password,
    passwordUpdatedAt: password ? new Date() : null,
  };
}

test('hashPassword/verifyPassword round-trips and rejects wrong password', () => {
  const stored = hashPassword('secret');
  assert.equal(verifyPassword('secret', stored), true);
  assert.equal(verifyPassword('nope', stored), false);
});

test('issued sessions store only a hash of the browser token', async () => {
  const { state, queries } = stubQueries({
    users: { [MEMBER]: user(MEMBER, '홍길동', 'member') },
  });
  const service = createAuthService(queries);
  const session = await service.setPassword({ memberId: MEMBER, password: 'pw123' });

  assert.ok(session.token);
  assert.equal(state.sessions.has(session.token), false);
  assert.equal(state.sessions.get(hashOpaqueToken(session.token)), MEMBER);
});

test('login returns authoritative role and logout removes the hashed session', async () => {
  const { state, queries } = stubQueries({
    users: { [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('pw123')) },
  });
  const service = createAuthService(queries);
  const session = await service.login({ memberId: ADMIN, password: 'pw123' });
  assert.equal(session.user.adminRole, 'admin');
  assert.equal(state.sessions.get(hashOpaqueToken(session.token)), ADMIN);

  await service.logout(session.token);
  assert.equal(state.sessions.has(hashOpaqueToken(session.token)), false);
});

test('admin reset invalidates sessions and consumes a one-time setup token', async () => {
  const { state, queries } = stubQueries({
    users: {
      [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('adminpw')),
      [MEMBER]: user(MEMBER, '홍길동', 'member', hashPassword('pw123')),
    },
  });
  const service = createAuthService(queries);
  const session = await service.login({ memberId: MEMBER, password: 'pw123' });
  const reset = await service.resetPassword({ actorId: ADMIN, targetMemberId: MEMBER });

  assert.equal(state.sessions.has(hashOpaqueToken(session.token)), false);
  assert.ok(state.setupTokens.has(hashOpaqueToken(reset.setupToken)));
  await assert.rejects(
    () => service.setPassword({ memberId: MEMBER, password: 'newpw' }),
    (error) => error.code === 'SETUP_TOKEN_REQUIRED',
  );
  await service.setPassword({
    memberId: MEMBER,
    password: 'newpw',
    setupToken: reset.setupToken,
  });
  assert.equal(verifyPassword('newpw', state.users[MEMBER].passwordHash), true);
});

test('admin cannot reset admin or owner, while owner can reset an admin', async () => {
  const { queries } = stubQueries({
    users: {
      [OWNER]: user(OWNER, '이상명', 'owner', hashPassword('ownerpw')),
      [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('adminpw')),
    },
  });
  const service = createAuthService(queries);
  await assert.rejects(
    () => service.resetPassword({ actorId: ADMIN, targetMemberId: OWNER }),
    (error) => error.code === 'OWNER_PASSWORD_LOCKED',
  );
  await assert.rejects(
    () => service.resetPassword({ actorId: ADMIN, targetMemberId: ADMIN }),
    (error) => error.code === 'RESET_ROLE_FORBIDDEN',
  );
  assert.ok((await service.resetPassword({ actorId: OWNER, targetMemberId: ADMIN })).setupToken);
});
