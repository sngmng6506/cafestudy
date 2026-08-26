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
        // 검색 결과에서 고른 장소의 참조. 직접 입력이면 없다.
        placeId: normalizePlaceField(req.body.placeId),
        placeUrl: normalizePlaceField(req.body.placeUrl),
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

// 장소 참조는 사용자가 보내는 값이라 그대로 믿지 않는다. 상세페이지 URL은 카카오
// 도메인만 받는다 — 다른 링크를 넣으면 소모임 정모에 그대로 올라가고, 그걸 누르는
// 건 모임 멤버들이다.
function normalizePlaceField(value) {
  const text = (value ?? '').toString().trim();
  if (!text || text.length > 300) return null;
  if (!/^https?:\/\//i.test(text)) return text;
  return /^https:\/\/place\.map\.kakao\.com\//.test(text) ? text : null;
}
