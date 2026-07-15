import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createAuthQueries } from './auth.queries.js';
import { createAuthService } from './auth.service.js';

export function createAuthRouter(ctx) {
  const router = Router();
  const queries = createAuthQueries(ctx.db);
  const service = createAuthService(queries);

  router.post('/set-password', async (req, res, next) => {
    try {
      sendOk(res, await service.setPassword(req.body ?? {}));
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      sendOk(res, await service.login(req.body ?? {}));
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
      const authHeader = req.header('authorization') ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      sendOk(res, await service.logout(token));
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
