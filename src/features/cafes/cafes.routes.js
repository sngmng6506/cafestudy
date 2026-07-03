import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createCafesService } from './cafes.service.js';

export function createCafesRouter(ctx) {
  const router = Router();
  const service = createCafesService(ctx.db);

  router.get('/', async (req, res, next) => {
    try {
      const cafes = await service.listCafes(ctx.auth.userId(req));
      sendOk(res, cafes);
    } catch (error) {
      next(error);
    }
  });

  router.post('/comments', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const comment = await service.upsertComment({
        userId: req.user.id,
        location: req.body.location,
        body: req.body.body,
      });
      sendOk(res, comment, 201);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
