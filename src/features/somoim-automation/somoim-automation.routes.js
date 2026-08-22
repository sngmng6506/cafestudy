import { Router } from 'express';
import { sendFail, sendOk } from '../../shared/api-response.js';
import { createSomoimAutomationService } from './somoim-automation.service.js';

export function createSomoimAutomationRouter(ctx, service = createSomoimAutomationService({
  db: ctx.db,
  allowSubmit: ctx.config?.somoimAutomation?.allowSubmit,
  staleClaimSeconds: ctx.config?.somoimAutomation?.staleClaimSeconds,
  maxAttempts: ctx.config?.somoimAutomation?.maxAttempts,
})) {
  const router = Router();
  const internalKey = ctx.config?.somoimAutomation?.internalApiKey ?? '';
  const requireInternalKey = (req, res, next) => {
    if (!internalKey || req.headers['x-internal-key'] !== internalKey) {
      return sendFail(res, 'UNAUTHORIZED', 'Invalid internal key', 401);
    }
    return next();
  };

  router.post('/meetups', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      return sendOk(res, await service.createMeetupJob({ requestedBy: req.user.id, input: req.body ?? {} }), 202);
    } catch (err) { return next(err); }
  });
  router.get('/jobs', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      return sendOk(res, await service.listJobs({
        status: req.query.status,
        limit: req.query.limit === undefined ? 20 : Number(req.query.limit),
        offset: req.query.offset === undefined ? 0 : Number(req.query.offset),
      }));
    } catch (err) { return next(err); }
  });
  router.get('/jobs/:id', ctx.auth.requireAdmin, async (req, res, next) => {
    try { return sendOk(res, await service.getJob(req.params.id)); }
    catch (err) { return next(err); }
  });
  router.post('/jobs/claim', requireInternalKey, async (_req, res, next) => {
    try { return sendOk(res, await service.claimNextJob()); }
    catch (err) { return next(err); }
  });
  router.post('/jobs/:id/complete', requireInternalKey, async (req, res, next) => {
    try { return sendOk(res, await service.completeJob({ id: req.params.id, result: req.body?.result })); }
    catch (err) { return next(err); }
  });
  router.post('/jobs/:id/fail', requireInternalKey, async (req, res, next) => {
    try {
      return sendOk(res, await service.failJob({
        id: req.params.id,
        errorMessage: req.body?.errorMessage,
        needsManualReview: req.body?.needsManualReview,
        result: req.body?.result,
      }));
    } catch (err) { return next(err); }
  });
  return router;
}
