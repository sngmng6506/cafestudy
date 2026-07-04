import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createBadgesService } from './badges.service.js';

export function createBadgesRouter(ctx) {
  const router = Router();
  const service = createBadgesService(ctx);

  router.get('/me', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const badges = await service.listUserBadges(req.user.id);
      sendOk(res, badges);
    } catch (error) {
      next(error);
    }
  });

  router.post('/generate', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const generation = await service.generateBadge({
        userId: req.user.id,
        prompt: req.body.prompt,
      });
      sendOk(res, generation, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post('/generations/:id/apply', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const badge = await service.applyGeneration({
        userId: req.user.id,
        generationId: req.params.id,
        title: req.body.title,
      });
      sendOk(res, badge, 201);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
