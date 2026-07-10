import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame2048Service } from '../src/features/game2048/game2048.service.js';

// db를 목킹해 service의 검증 로직만 단위 테스트한다.
// (upsert의 GREATEST 동작은 SQL 레벨이라 통합 테스트에서 검증)
function makeCtx(overrides = {}) {
  const calls = [];
  return {
    calls,
    ctx: {
      db: {
        async query(sql, params) {
          calls.push({ sql, params });
          // upsertBest는 bestScore를 반환하는 형태를 흉내
          return { rows: [{ bestScore: params?.[1] ?? 0 }] };
        },
      },
      storage: null,
      ...overrides,
    },
  };
}

test('submitScore: 음수 점수는 거부한다', async () => {
  const { ctx } = makeCtx();
  const service = createGame2048Service(ctx);
  await assert.rejects(() => service.submitScore('u1', -5), /점수가 올바르지 않습니다/);
});

test('submitScore: 정수가 아닌 점수는 거부한다', async () => {
  const { ctx } = makeCtx();
  const service = createGame2048Service(ctx);
  await assert.rejects(() => service.submitScore('u1', 12.5), /점수가 올바르지 않습니다/);
  await assert.rejects(() => service.submitScore('u1', NaN), /점수가 올바르지 않습니다/);
});

test('submitScore: 비상식적으로 큰 점수는 거부한다(변조 방어)', async () => {
  const { ctx } = makeCtx();
  const service = createGame2048Service(ctx);
  await assert.rejects(() => service.submitScore('u1', 999_999_999), /점수가 올바르지 않습니다/);
});

test('submitScore: 유효한 점수는 upsert 쿼리를 호출한다', async () => {
  const { ctx, calls } = makeCtx();
  const service = createGame2048Service(ctx);
  const result = await service.submitScore('u1', 1500);
  assert.equal(result.bestScore, 1500);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO game2048_scores/);
  assert.match(calls[0].sql, /GREATEST/); // 낮은 점수 제출을 무시하는 핵심
  assert.deepEqual(calls[0].params, ['u1', 1500]);
});

test('submitScore: 0점도 유효하다(경계값)', async () => {
  const { ctx } = makeCtx();
  const service = createGame2048Service(ctx);
  const result = await service.submitScore('u1', 0);
  assert.equal(result.bestScore, 0);
});
