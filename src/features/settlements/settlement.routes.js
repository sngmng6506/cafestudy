import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createSettlementService } from './settlement.service.js';

export function createSettlementRouter(ctx) {
  const router = Router();
  const service = createSettlementService(ctx);

  router.use(ctx.auth.requireUser);

  router.get('/', async (req, res, next) => {
    try {
      sendOk(res, await service.listForUser(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.get('/payment-method', async (req, res, next) => {
    try {
      sendOk(res, await service.getMyPaymentMethod(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.put('/payment-method', async (req, res, next) => {
    try {
      sendOk(res, await service.setPaymentMethod({
        userId: req.user.id,
        bankName: req.body?.bankName,
        bankAccountNumber: req.body?.bankAccountNumber,
        accountHolderName: req.body?.accountHolderName,
        kakaopayLink: req.body?.kakaopayLink,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const settlement = await service.create({
        meetupId: req.body?.meetupId,
        creatorId: req.user.id,
        participantIds: req.body?.participantIds,
        participantAmounts: req.body?.participantAmounts,
        totalAmount: req.body?.totalAmount,
      });
      sendOk(res, settlement, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/paid', async (req, res, next) => {
    try {
      sendOk(res, await service.markPaid({
        settlementId: req.params.id,
        userId: req.user.id,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id/paid', async (req, res, next) => {
    try {
      sendOk(res, await service.unmarkPaid({
        settlementId: req.params.id,
        userId: req.user.id,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      sendOk(res, await service.remove({
        settlementId: req.params.id,
        userId: req.user.id,
        isAdmin: req.user.isAdmin,
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
