import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { createMeetupService } from './meetup.service.js';

export function createMeetupRouter(ctx) {
  const router = Router();
  const meetupService = createMeetupService({ db: ctx.db, storage: ctx.storage, hooks: ctx.hooks });

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
        // 검색 결과에서 고른 장소의 참조. 직접 입력이면 없다. 검증은 service가 한다.
        placeId: req.body.placeId,
        placeUrl: req.body.placeUrl,
      });

      sendOk(res, meetup, 201);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', ctx.auth.requireUser, async (req, res, next) => {
    try {
      const result = await meetupService.cancelMeetup({ meetupId: req.params.id, userId: req.user.id });
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/retry-somoim', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, await meetupService.retrySomoimRegistration({
        meetupId: req.params.id,
        userId: req.user.id,
      }));
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
