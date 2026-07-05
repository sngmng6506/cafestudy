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

  // 로그인한 멤버만 토글할 수 있지만, 누가 눌렀는지는 기록하지 않는다.
  router.post('/toggle', ctx.auth.requireUser, async (_req, res, next) => {
    try {
      sendOk(res, await service.toggle());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
