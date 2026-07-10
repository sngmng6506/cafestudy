import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createGame2048Service } from './game2048.service.js';

export function createGame2048Router(ctx) {
  const router = Router();
  const service = createGame2048Service(ctx);

  // 게임오버 시 점수 제출 (로그인 필요). 기존 최고보다 높을 때만 갱신.
  router.post('/score', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await service.submitScore(req.user.id, req.body?.score);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/my-best', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await service.getMyBest(req.user.id);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  // 진행 중인 게임 상태 저장/복원 (이어서 하기). 매 이동이 아니라 페이지 이탈 시 저장.
  router.put('/state', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await service.saveState(req.user.id, req.body?.state);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/state', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await service.loadState(req.user.id);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/state', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await service.clearState(req.user.id);
      sendOk(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/ranking', async (_req, res, next) => {
    try {
      const ranking = await service.getRanking();
      sendOk(res, ranking);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
