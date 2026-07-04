import { throwValidation, throwNotFound, throwForbidden, throwConflict } from '../../shared/errors.js';
import { hashPassword, verifyPassword, createToken } from './auth.util.js';

const MIN_PASSWORD_LENGTH = 4;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export function createAuthService(queries) {
  async function issueSession(user) {
    const token = createToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await queries.insertSession(token, user.id, expiresAt);
    return {
      token,
      user: { id: user.id, name: user.nickname, isAdmin: user.isAdmin === true },
    };
  }

  return {
    // 최초 비밀번호 설정 + 즉시 로그인. 이미 설정된 계정은 관리자 초기화 전엔 재설정 불가.
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

    // 기존 비밀번호 검증 후 로그인.
    async login({ memberId, password }) {
      if (!memberId) throwValidation('memberId가 필요합니다');
      if (typeof password !== 'string' || password.length === 0) {
        throwValidation('비밀번호를 입력하세요');
      }

      const user = await queries.getAuthUserById(memberId);
      if (!user) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다');
      if (!user.passwordHash) {
        // 프론트가 최초 설정 화면으로 유도한다.
        throwForbidden('PASSWORD_NOT_SET', '비밀번호가 설정되어 있지 않습니다');
      }
      if (!verifyPassword(password, user.passwordHash)) {
        throwForbidden('INVALID_PASSWORD', '비밀번호가 올바르지 않습니다');
      }

      return issueSession(user);
    },

    // 관리자 전용: 대상 비밀번호를 초기화한다 (라우트에서 requireAdmin 으로 가드).
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
