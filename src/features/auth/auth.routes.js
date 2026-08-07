import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createAuthQueries } from './auth.queries.js';
import { createAuthService } from './auth.service.js';

export function createAuthRouter(ctx) {
  const router = Router();
  const queries = createAuthQueries(ctx.db);
  const authConfig = ctx.config?.auth ?? {};
  const service = createAuthService(queries, { sessionTtlMs: authConfig.sessionTtlMs });

  router.post('/set-password', async (req, res, next) => {
    try {
      const session = await service.setPassword(req.body ?? {});
      setSessionCookie(res, session.token, authConfig);
      sendOk(res, publicSession(session));
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const session = await service.login(req.body ?? {});
      setSessionCookie(res, session.token, authConfig);
      sendOk(res, publicSession(session));
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, await service.currentUser(req.user.id));
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await service.logout(req.authToken ?? ctx.auth.tokenFromRequest(req));
      clearSessionCookie(res, authConfig);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-password', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      sendOk(res, await service.resetPassword({
        actorId: req.user.id,
        targetMemberId: req.body?.memberId,
      }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function setSessionCookie(res, token, config = {}) {
  res.setHeader('Set-Cookie', serializeSessionCookie(token, {
    ...config,
    maxAgeMs: config.sessionTtlMs,
  }));
}

export function clearSessionCookie(res, config = {}) {
  res.setHeader('Set-Cookie', serializeSessionCookie('', { ...config, maxAgeMs: 0 }));
}

export function serializeSessionCookie(token, {
  cookieName = 'cafestudy_session',
  secureCookie = false,
  maxAgeMs = 0,
} = {}) {
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];
  if (secureCookie) parts.push('Secure');
  return parts.join('; ');
}

function publicSession({ user, expiresAt }) {
  return { user, expiresAt };
}
