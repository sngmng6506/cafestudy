import { Router } from 'express';
import { sendOk, sendFail } from '../../shared/api-response.js';
import { createMembersQueries } from './members.queries.js';
import { createMembersService } from './members.service.js';

function requireInternalKey(req, res, next) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || req.headers['x-internal-key'] !== key) {
    return sendFail(res, 'UNAUTHORIZED', '유효하지 않은 internal key입니다', 401);
  }
  next();
}

export function createMembersRouter(ctx) {
  const router = Router();
  const queries = createMembersQueries(ctx.db);
  const service = createMembersService(ctx.db, queries, ctx.storage);

  router.post('/sync', requireInternalKey, async (req, res) => {
    try {
      const result = await service.syncMembers(req.body);
      return sendOk(res, result);
    } catch (err) {
      if (err.code === 'INVALID_PAYLOAD') {
        return sendFail(res, 'INVALID_PAYLOAD', err.message, 400);
      }
      console.error('[members/sync]', err);
      return sendFail(res, 'SYNC_FAILED', '동기화 중 오류가 발생했습니다', 500);
    }
  });

  router.get('/', async (_req, res) => {
    try {
      const members = await service.listMembers();
      return sendOk(res, members);
    } catch (err) {
      console.error('[members/list]', err);
      return sendFail(res, 'FETCH_FAILED', '멤버 목록 조회 실패', 500);
    }
  });

  router.get('/events', async (_req, res) => {
    try {
      const events = await service.listEvents();
      return sendOk(res, events);
    } catch (err) {
      console.error('[members/events]', err);
      return sendFail(res, 'FETCH_FAILED', '정모 목록 조회 실패', 500);
    }
  });

  // 아바타 이미지 프록시. CDN 직링크는 핫링크 차단/CORS로 브라우저에서
  // 깨질 수 있어, 서버가 대신 받아 전달한다. 하루 캐시.
  router.get('/:id/avatar', async (req, res) => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
        return sendFail(res, 'NOT_FOUND', '아바타가 없습니다', 404);
      }
      const avatarUrl = await service.getMemberAvatarUrl(req.params.id);
      if (!avatarUrl) {
        return sendFail(res, 'NOT_FOUND', '아바타가 없습니다', 404);
      }

      const upstream = await fetch(avatarUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.somoim.co.kr/' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) {
        return sendFail(res, 'UPSTREAM_FAILED', '아바타를 가져오지 못했습니다', 502);
      }

      res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      console.error('[members/avatar]', err);
      return sendFail(res, 'FETCH_FAILED', '아바타 조회 실패', 500);
    }
  });

  router.get('/sync-logs', requireInternalKey, async (_req, res) => {
    try {
      const logs = await service.listSyncLogs();
      return sendOk(res, logs);
    } catch (err) {
      console.error('[members/sync-logs]', err);
      return sendFail(res, 'FETCH_FAILED', '동기화 로그 조회 실패', 500);
    }
  });

  return router;
}
