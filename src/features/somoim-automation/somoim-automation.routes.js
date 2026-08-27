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
  router.post('/meetups/delete', ctx.auth.requireAdmin, async (req, res, next) => {
    try {
      return sendOk(res, await service.deleteMeetupJob({ requestedBy: req.user.id, input: req.body ?? {} }), 202);
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
    try {
      const outcome = await service.claimNextJob();

      // 재시도를 다 쓰고 사람에게 넘어간 job은 모임 쪽에도 실패를 알려야
      // pending에 갇히지 않는다. fail 라우트와 같은 자리에서 emit한다.
      for (const job of outcome.exhausted ?? []) {
        await ctx.hooks?.emit?.('somoimRegistrationFailed', { jobId: job.id });
      }
      return sendOk(res, outcome);
    } catch (err) { return next(err); }
  });
  router.post('/jobs/:id/preflight', requireInternalKey, async (req, res, next) => {
    try {
      const outcome = await service.preflightJob(req.params.id);
      if (outcome.action === 'existing_event') {
        await ctx.hooks?.emit?.('somoimRegistrationSucceeded', { jobId: req.params.id });
      }
      return sendOk(res, outcome);
    } catch (err) { return next(err); }
  });
  // worker가 되돌릴 수 없는 제출 직전에 부른다. 이 호출이 성공해야 worker가 버튼을
  // 누른다 — 실패하면 표시가 없어 중복을 막을 수 없으므로 제출하지 않고 물러난다.
  router.post('/jobs/:id/submit-attempt', requireInternalKey, async (req, res, next) => {
    try { return sendOk(res, await service.markSubmitAttempted(req.params.id)); }
    catch (err) { return next(err); }
  });
  router.post('/jobs/:id/complete', requireInternalKey, async (req, res, next) => {
    try {
      const job = await service.completeJob({ id: req.params.id, result: req.body?.result });
      await ctx.hooks?.emit?.('somoimRegistrationSucceeded', { jobId: job.id });
      return sendOk(res, job);
    } catch (err) { return next(err); }
  });
  router.post('/jobs/:id/fail', requireInternalKey, async (req, res, next) => {
    try {
      const job = await service.failJob({
        id: req.params.id,
        errorMessage: req.body?.errorMessage,
        needsManualReview: req.body?.needsManualReview,
        result: req.body?.result,
      });

      // 재시도 여지가 없을 때만 모임 쪽에 실패를 알린다. 단 제출을 시도한 job은
      // 알리지 않는다 — 모임이 failed가 되면 개설자가 "다시 시도"를 눌러 중복
      // 정모를 만들 수 있다. 그 job은 needs_manual_review로 남아 사람이 정리한다.
      if (!job.requeued && !job.submitAttemptedAt) {
        await ctx.hooks?.emit?.('somoimRegistrationFailed', { jobId: job.id });
      }
      return sendOk(res, job);
    } catch (err) { return next(err); }
  });
  return router;
}
