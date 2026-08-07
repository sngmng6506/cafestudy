import { fail } from '../shared/api-response.js';
import { publicRoleFlags } from '../shared/roles.js';
import { hashOpaqueToken } from '../features/auth/auth.util.js';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export function createAuth({ env, db, config = {} }) {
  const cookieName = config.cookieName || 'cafestudy_session';
  const allowBearerAuth = config.allowBearerAuth === true;

  async function lookupSession(rawToken) {
    if (!db || !rawToken) return null;
    const tokenHash = hashOpaqueToken(rawToken);
    const result = await db.query(
      `SELECT
         s.user_id AS id,
         CASE
           WHEN ao.user_id IS NOT NULL THEN 'owner'
           WHEN u.admin_role = 'owner' THEN 'admin'
           ELSE COALESCE(u.admin_role, CASE WHEN u.is_admin THEN 'admin' ELSE 'member' END)
         END AS "adminRole"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN app_owner ao ON ao.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  function tokenFromRequest(req) {
    const cookieToken = readCookie(req.header('cookie') ?? '', cookieName);
    if (cookieToken) return cookieToken;

    if (!allowBearerAuth) return '';
    const authHeader = req.header('authorization') ?? '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  }

  return {
    cookieName,
    config,

    async resolveUser(req, _res, next) {
      try {
        const token = tokenFromRequest(req);
        if (token) {
          const session = await lookupSession(token);
          if (session) {
            req.user = {
              id: session.id,
              ...publicRoleFlags(session.adminRole),
            };
            req.userId = session.id;
            req.authToken = token;
            return next();
          }
        }

        if (env !== 'production') {
          const headerUserId = req.header('x-user-id');
          const userId = headerUserId || DEMO_USER_ID;
          req.user = { id: userId, ...publicRoleFlags('member') };
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

    tokenFromRequest,

    userId(req) {
      return req.userId ?? (env !== 'production' ? DEMO_USER_ID : null);
    },
  };
}

function readCookie(header, name) {
  const prefix = `${name}=`;
  for (const part of header.split(';')) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(value.slice(prefix.length));
    } catch {
      return '';
    }
  }
  return '';
}
