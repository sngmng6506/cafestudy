import { fail } from '../shared/api-response.js';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export function createAuth({ env, db }) {
  async function lookupSession(token) {
    if (!db) return null;
    const result = await db.query(
      `SELECT
         s.user_id AS id,
         COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END) AS "adminRole"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  return {
    async resolveUser(req, _res, next) {
      try {
        const authHeader = req.header('authorization') ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

        if (token) {
          const session = await lookupSession(token);
          if (session) {
            const adminRole = session.adminRole ?? 'member';
            req.user = {
              id: session.id,
              adminRole,
              isAdmin: adminRole === 'admin' || adminRole === 'owner',
              isOwner: adminRole === 'owner',
            };
            req.userId = session.id;
            return next();
          }
        }

        if (env !== 'production') {
          const headerUserId = req.header('x-user-id');
          const userId = headerUserId || DEMO_USER_ID;
          req.user = { id: userId, adminRole: 'member', isAdmin: false, isOwner: false };
          req.userId = userId;
        }

        return next();
      } catch (err) {
        return next(err);
      }
    },

    requireUser(req, res, next) {
      if (req.user?.id) return next();
      return res.status(401).json(fail('UNAUTHENTICATED', '로그인이 필요합니다.'));
    },

    requireAdmin(req, res, next) {
      if (!req.user?.id) {
        return res.status(401).json(fail('UNAUTHENTICATED', '로그인이 필요합니다.'));
      }
      if (!req.user.isAdmin) {
        return res.status(403).json(fail('FORBIDDEN', '관리자만 사용할 수 있습니다.'));
      }
      return next();
    },

    requireOwner(req, res, next) {
      if (!req.user?.id) {
        return res.status(401).json(fail('UNAUTHENTICATED', '로그인이 필요합니다.'));
      }
      if (!req.user.isOwner) {
        return res.status(403).json(fail('OWNER_REQUIRED', '최고 관리자만 권한을 변경할 수 있습니다.'));
      }
      return next();
    },

    userId(req) {
      return req.userId ?? (env !== 'production' ? DEMO_USER_ID : null);
    },
  };
}
