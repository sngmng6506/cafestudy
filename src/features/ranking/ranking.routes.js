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

  router.get('/monthly', async (req, res, next) => {
    try {
      const params = parseMonthQuery(req.query);
      const ranking = await rankingService.getMonthlyRanking(params);
      sendOk(res, ranking);
    } catch (error) {
      next(error);
    }
  });

  // year/month가 없으면 전체 기간이다. 월간 랭킹은 생략 시 이번 달로 보지만,
  // 참석은 "지금까지 몇 번"을 보는 쪽이 기본이라 다르게 둔다.
  router.get('/attendance', async (req, res, next) => {
    try {
      const ranking = await rankingService.getAttendanceRanking(parseMonthQuery(req.query));
      sendOk(res, ranking);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

// Returns {} (current month) when no params, or a validated { year, month }.
function parseMonthQuery(query) {
  if (query.year === undefined && query.month === undefined) {
    return {};
  }

  const year = Number(query.year);
  const month = Number(query.month);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 2100
  ) {
    const error = new Error('year와 month 값이 올바르지 않습니다.');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  return { year, month };
}
