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
      const result = await service.setPassword(req.body ?? {});
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const result = await service.login(req.body ?? {});
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const authHeader = req.header('authorization') ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const result = await service.logout(token);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-password', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      const result = await service.resetPassword({ targetMemberId: req.body?.memberId });
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
