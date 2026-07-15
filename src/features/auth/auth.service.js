import { throwValidation, throwNotFound, throwForbidden, throwConflict } from '../../shared/errors.js';
import { createSetupToken, createToken, hashOpaqueToken, hashPassword, verifyPassword } from './auth.util.js';

const MIN_PASSWORD_LENGTH = 4;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function publicUser(user) {
  const adminRole = user.adminRole ?? 'member';
  return {
    id: user.id,
    name: user.nickname,
    adminRole,
    isAdmin: adminRole === 'admin' || adminRole === 'owner',
    isOwner: adminRole === 'owner',
  };
}

export function createAuthService(queries) {
  async function issueSession(user) {
    const token = createToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await queries.insertSession(token, user.id, expiresAt);
    return { token, user: publicUser(user) };
  }

  return {
    async setPassword({ memberId, password, setupToken }) {
      if (!memberId) throwValidation('memberId가 필요합니다');
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        throwValidation(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`);
      }

      const user = await queries.getAuthUserById(memberId);
      if (!user) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      if (user.passwordHash) {
        throwConflict('PASSWORD_ALREADY_SET', '이미 비밀번호가 설정되어 있습니다');
      }

      const passwordHash = hashPassword(password);
      if (user.passwordUpdatedAt) {
        if (typeof setupToken !== 'string' || !setupToken.trim()) {
          throwForbidden('SETUP_TOKEN_REQUIRED', '관리자에게 받은 비밀번호 설정 코드를 입력해 주세요.');
        }
        const consumed = await queries.consumeSetupToken({
          userId: memberId,
          tokenHash: hashOpaqueToken(setupToken.trim()),
          passwordHash,
        });
        if (!consumed) {
          throwForbidden('INVALID_SETUP_TOKEN', '설정 코드가 올바르지 않거나 만료됐어요. 관리자에게 새 코드를 요청해 주세요.');
        }
      } else {
        const created = await queries.setInitialPassword(memberId, passwordHash);
        if (!created) {
          throwConflict('PASSWORD_SETUP_CHANGED', '비밀번호 설정 상태가 바뀌었어요. 다시 시도해 주세요.');
        }
      }

      return issueSession(user);
    },

    async login({ memberId, password }) {
      if (!memberId) throwValidation('memberId가 필요합니다');
      if (typeof password !== 'string' || password.length === 0) {
        throwValidation('비밀번호를 입력하세요');
      }

      const user = await queries.getAuthUserById(memberId);
      if (!user) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      if (!user.passwordHash) {
        throwForbidden('PASSWORD_NOT_SET', '비밀번호가 설정되어 있지 않습니다');
      }
      if (!verifyPassword(password, user.passwordHash)) {
        throwForbidden('INVALID_PASSWORD', '비밀번호가 올바르지 않습니다');
      }

      return issueSession(user);
    },

    async currentUser(userId) {
      const user = await queries.getAuthUserById(userId);
      if (!user) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      return publicUser(user);
    },

    async resetPassword({ actorId, targetMemberId }) {
      if (!targetMemberId) throwValidation('memberId가 필요합니다');
      const [actor, target] = await Promise.all([
        queries.getAuthUserById(actorId),
        queries.getAuthUserById(targetMemberId),
      ]);
      if (!actor) throwForbidden('ADMIN_REQUIRED', '관리자 계정을 확인할 수 없어요.');
      if (!target) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      if (target.adminRole === 'owner') {
        throwForbidden('OWNER_PASSWORD_LOCKED', '최고 관리자 비밀번호는 이 기능으로 초기화할 수 없어요.');
      }
      if (actor.adminRole === 'admin' && target.adminRole !== 'member') {
        throwForbidden('RESET_ROLE_FORBIDDEN', '관리자는 일반 멤버의 비밀번호만 초기화할 수 있어요.');
      }
      if (actor.adminRole !== 'owner' && actor.adminRole !== 'admin') {
        throwForbidden('ADMIN_REQUIRED', '관리자만 비밀번호를 초기화할 수 있어요.');
      }

      const setupToken = createSetupToken();
      const expiresAt = new Date(Date.now() + SETUP_TOKEN_TTL_MS);
      await queries.createPasswordSetupToken({
        userId: targetMemberId,
        createdBy: actorId,
        tokenHash: hashOpaqueToken(setupToken),
        expiresAt,
      });
      return { memberId: targetMemberId, setupToken, expiresAt };
    },

    async logout(token) {
      if (token) await queries.deleteSession(token);
      return { ok: true };
    },
  };
}
