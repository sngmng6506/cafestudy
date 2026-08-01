import { Router } from 'express';
import { sendFail, sendOk } from '../../shared/api-response.js';
import { createSomoimAutomationService } from './somoim-automation.service.js';

function requireInternalKey(req, res, next) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || req.headers['x-internal-key'] !== key) {
    return sendFail(res, 'UNAUTHORIZED', 'Invalid internal key', 401);
  }
  return next();
}

export function createSomoimAutomationRouter(ctx, service = createSomoimAutomationService({ db: ctx.db })) {
  const router = Router();

  router.post('/meetups', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      const job = await service.createMeetupJob({
        requestedBy: req.user.id,
        input: req.body ?? {},
      });
      return sendOk(res, job, 202);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/jobs/:id', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      const job = await service.getJob(req.params.id);
      return sendOk(res, job);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/jobs/claim', requireInternalKey, async (_req, res, next) => {
    try {
      const result = await service.claimNextJob();
      return sendOk(res, result);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/jobs/:id/complete', requireInternalKey, async (req, res, next) => {
    try {
      const job = await service.completeJob({
        id: req.params.id,
        result: req.body?.result,
      });
      return sendOk(res, job);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/jobs/:id/fail', requireInternalKey, async (req, res, next) => {
    try {
      const job = await service.failJob({
        id: req.params.id,
        errorMessage: req.body?.errorMessage,
        needsManualReview: req.body?.needsManualReview,
        result: req.body?.result,
      });
      return sendOk(res, job);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
