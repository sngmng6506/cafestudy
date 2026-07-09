import { Router } from 'express';
import { sendOk, sendFail } from '../../shared/api-response.js';

function requireInternalKey(req, res, next) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || req.headers['x-internal-key'] !== key) {
    return sendFail(res, 'UNAUTHORIZED', '유효하지 않은 internal key입니다', 401);
  }
  next();
}

export function createMembersRouter(ctx, service) {
  const router = Router();

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

  // 사용자용 갱신 버튼 트리거. 내부 키 없이 호출 가능하되, 서버가 5분 쿨타임을
  // 강제해 남용을 막는다. 쿨타임 중이면 크롤링 없이 남은 시간만 반환.
  router.post('/refresh', async (_req, res) => {
    try {
      const result = await service.refreshFromSomoim(process.env.SOMOIM_URL);
      return sendOk(res, result);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        return sendFail(res, 'VALIDATION_ERROR', err.message, 400);
      }
      console.error('[members/refresh]', err);
      return sendFail(res, 'REFRESH_FAILED', '갱신 중 오류가 발생했습니다', 500);
    }
  });

  // 갱신 버튼 초기 상태(쿨타임 남은 시간, 진행 여부).
  router.get('/refresh-status', (_req, res) => {
    return sendOk(res, service.getRefreshStatus());
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

  // 프로필 카드용 활동 통계 (모임 참여/인증/정모 참석 횟수).
  router.get('/:id/stats', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      return sendFail(res, 'NOT_FOUND', '멤버를 찾을 수 없습니다', 404);
    }
    try {
      const stats = await service.getMemberStats(req.params.id);
      return sendOk(res, stats);
    } catch (err) {
      console.error('[members/stats]', err);
      return sendFail(res, 'FETCH_FAILED', '멤버 통계 조회 실패', 500);
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
