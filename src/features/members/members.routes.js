import { Router } from 'express';
import { sendOk, sendFail } from '../../shared/api-response.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createMembersRouter(ctx, service) {
  const router = Router();
  const internalKey = ctx.config?.internalApiKey ?? '';
  const somoimUrl = ctx.config?.members?.somoimUrl ?? '';
  const requireInternalKey = (req, res, next) => {
    if (!internalKey || req.headers['x-internal-key'] !== internalKey) {
      return sendFail(res, 'UNAUTHORIZED', '유효하지 않은 internal key입니다', 401);
    }
    return next();
  };

  router.post('/sync', requireInternalKey, async (req, res) => {
    try {
      return sendOk(res, await service.syncMembers(req.body));
    } catch (err) {
      if (err.code === 'INVALID_PAYLOAD') return sendFail(res, 'INVALID_PAYLOAD', err.message, 400);
      console.error('[members/sync]', err);
      return sendFail(res, 'SYNC_FAILED', '동기화 중 오류가 발생했습니다', 500);
    }
  });

  router.post('/refresh', async (_req, res) => {
    try {
      return sendOk(res, await service.refreshFromSomoim(somoimUrl));
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') return sendFail(res, 'VALIDATION_ERROR', err.message, 400);
      console.error('[members/refresh] 크롤링 실패:', err.stack || err.message);
      return sendFail(res, 'REFRESH_FAILED', `갱신 실패: ${err.message}`, 500);
    }
  });

  router.get('/refresh-status', (_req, res) => sendOk(res, service.getRefreshStatus()));

  router.get('/', async (_req, res) => {
    try { return sendOk(res, await service.listMembers()); }
    catch (err) {
      console.error('[members/list]', err);
      return sendFail(res, 'FETCH_FAILED', '멤버 목록 조회 실패', 500);
    }
  });

  router.get('/events', async (_req, res) => {
    try { return sendOk(res, await service.listEvents()); }
    catch (err) {
      console.error('[members/events]', err);
      return sendFail(res, 'FETCH_FAILED', '정모 목록 조회 실패', 500);
    }
  });

  router.get('/:id/stats', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return sendFail(res, 'NOT_FOUND', '멤버를 찾을 수 없습니다', 404);
    }
    try { return sendOk(res, await service.getMemberStats(req.params.id)); }
    catch (err) {
      console.error('[members/stats]', err);
      return sendFail(res, 'FETCH_FAILED', '멤버 통계 조회 실패', 500);
    }
  });

  router.get('/:id/avatar', async (req, res) => {
    try {
      if (!UUID_PATTERN.test(req.params.id)) {
        return sendFail(res, 'NOT_FOUND', '아바타가 없습니다', 404);
      }
      const avatarUrl = await service.getMemberAvatarUrl(req.params.id);
      if (!avatarUrl) return sendFail(res, 'NOT_FOUND', '아바타가 없습니다', 404);

      const upstream = await fetch(avatarUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.somoim.co.kr/' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) return sendFail(res, 'UPSTREAM_FAILED', '아바타를 가져오지 못했습니다', 502);
      res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      console.error('[members/avatar]', err);
      return sendFail(res, 'FETCH_FAILED', '아바타 조회 실패', 500);
    }
  });

  router.get('/sync-logs', requireInternalKey, async (_req, res) => {
    try { return sendOk(res, await service.listSyncLogs()); }
    catch (err) {
      console.error('[members/sync-logs]', err);
      return sendFail(res, 'FETCH_FAILED', '동기화 로그 조회 실패', 500);
    }
  });

  return router;
}
