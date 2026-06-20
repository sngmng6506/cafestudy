import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createMeetupService } from './meetup.service.js';

export function createMeetupRouter(ctx) {
  const router = Router();
  const meetupService = createMeetupService(ctx);

  router.get('/', async (_req, res, next) => {
    try {
      const meetups = await meetupService.listMeetups();
      sendOk(res, meetups);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const meetup = await meetupService.createMeetup({
        hostId: req.user.id,
        title: req.body.title,
        cafeName: req.body.cafeName,
        location: req.body.location,
        scheduledAt: req.body.scheduledAt,
      });

      sendOk(res, meetup, 201);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
