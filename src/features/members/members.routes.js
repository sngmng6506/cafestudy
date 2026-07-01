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
  const service = createMembersService(ctx.db, queries);

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
