import { throwConflict, throwForbidden, throwNotFound, throwValidation } from '../../shared/errors.js';
import { createAdminQueries } from './admin.queries.js';

const ASSIGNABLE_ROLES = new Set(['member', 'admin']);

export function createAdminService({ db }) {
  const queries = createAdminQueries(db);

  return {
    listUsers: () => queries.listUsers(),

    async updateRole({ actorId, targetUserId, role }) {
      if (!targetUserId) throwValidation('역할을 바꿀 멤버가 필요합니다.');
      if (!ASSIGNABLE_ROLES.has(role)) {
        throwValidation('멤버 또는 관리자로만 변경할 수 있어요.');
      }
      if (actorId === targetUserId) {
        throwConflict('OWNER_ROLE_LOCKED', '자신의 최고 관리자 권한은 이 화면에서 바꿀 수 없어요.');
      }

      const target = await queries.findUser(targetUserId);
      if (!target) throwNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없어요.');
      if (target.role === 'owner') {
        throwForbidden('OWNER_ROLE_LOCKED', '최고 관리자 권한은 변경할 수 없어요.');
      }

      return queries.updateRole({ targetUserId, changedBy: actorId, role });
    },
  };
}
