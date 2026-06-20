import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createMeetupService } from './meetup.service.js';

export function createMeetupRouter(ctx) {
  const router = Router();
  const meetupService = createMeetupService(ctx);

  router.get('/', async (req, res, next) => {
    try {
      const meetups = await meetupService.listMeetups(ctx.auth.userId(req));
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
        description: req.body.description ?? null,
        location: req.body.location,
        scheduledAt: req.body.scheduledAt,
        capacity: Number(req.body.capacity),
      });

      sendOk(res, meetup, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/join', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await meetupService.joinMeetup({ meetupId: req.params.id, userId: req.user.id });
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id/join', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await meetupService.leaveMeetup({ meetupId: req.params.id, userId: req.user.id });
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
