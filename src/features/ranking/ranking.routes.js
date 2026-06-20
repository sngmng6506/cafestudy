import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createRankingService } from './ranking.service.js';

export function createRankingRouter(ctx) {
  const router = Router();
  const rankingService = createRankingService(ctx);

  router.get('/all-time', async (_req, res, next) => {
    try {
      const ranking = await rankingService.getAllTimeRanking();
      sendOk(res, ranking);
    } catch (error) {
      next(error);
    }
  });

  router.get('/monthly', async (_req, res, next) => {
    try {
      const ranking = await rankingService.getMonthlyRanking();
      sendOk(res, ranking);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
