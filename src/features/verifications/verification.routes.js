import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createVerificationService } from './verification.service.js';

export function createVerificationRouter(ctx) {
  const router = Router();
  const verificationService = createVerificationService(ctx);

  router.get('/', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const verifications = await verificationService.listMyVerifications(req.user.id);
      sendOk(res, verifications);
    } catch (error) {
      next(error);
    }
  });

  router.get('/photos', ctx.auth.requireUser, async (_req, res, next) => {
    try {
      const photos = await verificationService.listApprovedPhotos();
      sendOk(res, photos);
    } catch (error) {
      next(error);
    }
  });

  router.post('/upload-url', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await verificationService.createUploadUrl({
        userId: req.user.id,
        meetupId: req.body.meetupId,
        contentType: req.body.contentType,
      });

      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const verification = await verificationService.createVerification({
        userId: req.user.id,
        meetupId: req.body.meetupId,
        photoUrl: req.body.photoUrl,
      });

      sendOk(res, verification, 201);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
