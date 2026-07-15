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
      async getAuthUserById(id) {
        return state.users[id] ?? null;
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
        for (const [token, uid] of sessions) if (uid === userId) sessions.delete(token);
        setupTokens.set(tokenHash, {
          userId,
          createdBy,
          expiresAt: expiresAt.getTime(),
          used: false,
        });
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

test('first password setup requires an administrator-issued token', async () => {
  const { state, queries } = stubQueries({
    users: {
      [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('adminpw')),
      [MEMBER]: user(MEMBER, '홍길동', 'member'),
    },
  });
  const service = createAuthService(queries);

  await assert.rejects(
    () => service.setPassword({ memberId: MEMBER, password: 'pw123' }),
    (err) => err.code === 'SETUP_TOKEN_REQUIRED',
  );

  const reset = await service.resetPassword({ actorId: ADMIN, targetMemberId: MEMBER });
  const { token, user: resultUser } = await service.setPassword({
    memberId: MEMBER,
    password: 'pw123',
    setupToken: reset.setupToken,
  });
  assert.ok(token);
  assert.equal(resultUser.adminRole, 'member');
  assert.ok(state.users[MEMBER].passwordHash);
  assert.equal(state.sessions.get(token), MEMBER);
});

test('setPassword rejects when a password is already set', async () => {
  const { queries } = stubQueries({
    users: { [MEMBER]: user(MEMBER, '홍길동', 'member', hashPassword('pw')) },
  });
  const service = createAuthService(queries);

  await assert.rejects(
    () => service.setPassword({ memberId: MEMBER, password: 'newpw', setupToken: 'unused' }),
    (err) => err.statusCode === 409 && err.code === 'PASSWORD_ALREADY_SET',
  );
});

test('login succeeds with the correct password and returns the stored role', async () => {
  const { queries } = stubQueries({
    users: { [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('pw123')) },
  });
  const service = createAuthService(queries);

  const { token, user: resultUser } = await service.login({ memberId: ADMIN, password: 'pw123' });
  assert.ok(token);
  assert.equal(resultUser.adminRole, 'admin');

  await assert.rejects(
    () => service.login({ memberId: ADMIN, password: 'wrong' }),
    (err) => err.statusCode === 403 && err.code === 'INVALID_PASSWORD',
  );
});

test('admin reset invalidates sessions and requires the one-time setup token', async () => {
  const { state, queries } = stubQueries({
    users: {
      [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('adminpw')),
      [MEMBER]: user(MEMBER, '홍길동', 'member', hashPassword('pw123')),
    },
  });
  const service = createAuthService(queries);
  const { token } = await service.login({ memberId: MEMBER, password: 'pw123' });

  const reset = await service.resetPassword({ actorId: ADMIN, targetMemberId: MEMBER });
  assert.equal(state.users[MEMBER].passwordHash, null);
  assert.equal(state.sessions.has(token), false);
  assert.ok(state.setupTokens.has(hashOpaqueToken(reset.setupToken)));

  await assert.rejects(
    () => service.setPassword({ memberId: MEMBER, password: 'newpw' }),
    (err) => err.code === 'SETUP_TOKEN_REQUIRED',
  );

  const session = await service.setPassword({
    memberId: MEMBER,
    password: 'newpw',
    setupToken: reset.setupToken,
  });
  assert.equal(session.user.id, MEMBER);
  assert.equal(verifyPassword('newpw', state.users[MEMBER].passwordHash), true);

  state.users[MEMBER].passwordHash = null;
  await assert.rejects(
    () => service.setPassword({ memberId: MEMBER, password: 'again', setupToken: reset.setupToken }),
    (err) => err.code === 'INVALID_SETUP_TOKEN',
  );
});

test('admin cannot reset admin or owner, while owner can reset an admin', async () => {
  const { queries } = stubQueries({
    users: {
      [OWNER]: user(OWNER, '이상명', 'owner', hashPassword('ownerpw')),
      [ADMIN]: user(ADMIN, '관리자', 'admin', hashPassword('adminpw')),
      [MEMBER]: user(MEMBER, '홍길동', 'member', hashPassword('memberpw')),
    },
  });
  const service = createAuthService(queries);

  await assert.rejects(
    () => service.resetPassword({ actorId: ADMIN, targetMemberId: OWNER }),
    (err) => err.code === 'OWNER_PASSWORD_LOCKED',
  );
  await assert.rejects(
    () => service.resetPassword({ actorId: ADMIN, targetMemberId: ADMIN }),
    (err) => err.code === 'RESET_ROLE_FORBIDDEN',
  );

  const reset = await service.resetPassword({ actorId: OWNER, targetMemberId: ADMIN });
  assert.ok(reset.setupToken);
});

test('currentUser returns the authoritative server role', async () => {
  const { queries } = stubQueries({
    users: { [OWNER]: user(OWNER, '이상명', 'owner', hashPassword('ownerpw')) },
  });
  const service = createAuthService(queries);
  const result = await service.currentUser(OWNER);
  assert.equal(result.adminRole, 'owner');
  assert.equal(result.isOwner, true);
});
