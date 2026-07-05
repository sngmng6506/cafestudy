import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createSmashService } from './smash.service.js';

export function createSmashRouter(ctx) {
  const router = Router();
  const service = createSmashService(ctx);

  router.get('/', async (_req, res, next) => {
    try {
      sendOk(res, await service.getState());
    } catch (error) {
      next(error);
    }
  });

  router.post('/toggle', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, await service.toggle(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
