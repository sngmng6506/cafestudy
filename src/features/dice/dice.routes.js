import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createDiceService } from './dice.service.js';

export function createDiceRouter(ctx) {
  const router = Router();
  const diceService = createDiceService(ctx);

  router.post('/roll', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await diceService.roll(req.user.id);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/my-points', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const points = await diceService.getMyPoints(req.user.id);
      sendOk(res, { points });
    } catch (err) {
      next(err);
    }
  });

  router.get('/ranking', async (_req, res, next) => {
    try {
      const ranking = await diceService.getRanking();
      sendOk(res, ranking);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
