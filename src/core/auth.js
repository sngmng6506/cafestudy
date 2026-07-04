import { fail } from '../shared/api-response.js';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

// 인증 미들웨어. 요청당 1회 `resolveUser`가 토큰(또는 dev 폴백)을 해석해
// req.user / req.userId 를 세팅하고, 이후 requireUser/requireAdmin/userId 는
// 이 값을 동기적으로 읽기만 한다 (기존 호출부 시그니처 유지).
export function createAuth({ env, db }) {
  async function lookupSession(token) {
    if (!db) return null;
    const result = await db.query(
      `SELECT s.user_id AS id, u.is_admin AS "isAdmin"
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > now()`,
      [token],
    );
    return result.rows[0] ?? null;
  }

  return {
    // 앱 전역 미들웨어. loadFeatures 직전에 app.use 로 등록한다.
    async resolveUser(req, _res, next) {
      try {
        const authHeader = req.header('authorization') ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

        if (token) {
          const session = await lookupSession(token);
          if (session) {
            req.user = { id: session.id, isAdmin: session.isAdmin === true };
            req.userId = session.id;
            return next();
          }
        }

        // dev/test 폴백: 토큰이 없거나 무효일 때만. production 에선 절대 폴백하지 않는다.
        if (env !== 'production') {
          const headerUserId = req.header('x-user-id');
          const userId = headerUserId || DEMO_USER_ID;
          req.user = { id: userId, isAdmin: false };
          req.userId = userId;
        }

        return next();
      } catch (err) {
        return next(err);
      }
    },

    requireUser(req, res, next) {
      if (req.user?.id) return next();
      return res.status(401).json(fail('UNAUTHENTICATED', 'Authentication is required'));
    },

    requireAdmin(req, res, next) {
      if (!req.user?.id) {
        return res.status(401).json(fail('UNAUTHENTICATED', 'Authentication is required'));
      }
      if (!req.user.isAdmin) {
        return res.status(403).json(fail('FORBIDDEN', 'Admin privileges are required'));
      }
      return next();
    },

    // Resolves the current user without rejecting — for public reads that still
    // want to personalize (e.g. "have I joined this meetup?").
    userId(req) {
      return req.userId ?? (env !== 'production' ? DEMO_USER_ID : null);
    },
  };
}
