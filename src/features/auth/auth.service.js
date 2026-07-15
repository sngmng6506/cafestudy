import { throwValidation, throwNotFound, throwForbidden, throwConflict } from '../../shared/errors.js';
import { hashPassword, verifyPassword, createToken } from './auth.util.js';

const MIN_PASSWORD_LENGTH = 4;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createAuthService(queries) {
  async function issueSession(user) {
    const token = createToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const adminRole = user.adminRole ?? 'member';
    await queries.insertSession(token, user.id, expiresAt);
    return {
      token,
      user: {
        id: user.id,
        name: user.nickname,
        adminRole,
        isAdmin: adminRole === 'admin' || adminRole === 'owner',
        isOwner: adminRole === 'owner',
      },
    };
  }

  return {
    async setPassword({ memberId, password }) {
      if (!memberId) throwValidation('memberId가 필요합니다');
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        throwValidation(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`);
      }

      const user = await queries.getAuthUserById(memberId);
      if (!user) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      if (user.passwordHash) {
        throwConflict('PASSWORD_ALREADY_SET', '이미 비밀번호가 설정되어 있습니다');
      }

      await queries.setPassword(memberId, hashPassword(password));
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

    async resetPassword({ targetMemberId }) {
      if (!targetMemberId) throwValidation('memberId가 필요합니다');
      const user = await queries.getAuthUserById(targetMemberId);
      if (!user) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      await queries.clearPassword(targetMemberId);
      return { memberId: targetMemberId };
    },

    async logout(token) {
      if (token) await queries.deleteSession(token);
      return { ok: true };
    },
  };
}
