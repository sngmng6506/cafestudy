import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createAdminService } from './admin.service.js';

export function createAdminRouter(ctx) {
  const router = Router();
  const service = createAdminService(ctx);

  router.get('/users', ctx.auth.requireAdmin, async (_req, res, next) => {
    try {
      sendOk(res, await service.listUsers());
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id/role', ctx.auth.requireOwner, async (req, res, next) => {
    try {
      sendOk(res, await service.updateRole({
        actorId: req.user.id,
        targetUserId: req.params.id,
        role: req.body?.role,
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
