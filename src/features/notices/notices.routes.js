import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createNoticesService } from './notices.service.js';

export function createNoticesRouter(ctx) {
  const router = Router();
  const service = createNoticesService(ctx);

  router.get('/', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const limit = req.query.limit === undefined ? null : Number(req.query.limit);
      const summary = req.query.summary === 'true';
      sendOk(res, await service.list(req.user.id, { limit, summary }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/unread-count', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, { count: await service.unreadCount(req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      const notice = await service.create({
        title: req.body?.title,
        body: req.body?.body,
        isPinned: req.body?.isPinned,
        createdBy: req.user.id,
      });
      sendOk(res, notice, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post('/read-all', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, await service.markAllRead(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      sendOk(res, await service.update(req.params.id, req.body ?? {}));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      sendOk(res, await service.remove(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/read', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, await service.markRead(req.params.id, req.user.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
