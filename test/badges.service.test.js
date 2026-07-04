import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBadgesService } from '../src/features/badges/badges.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const GENERATION_ID = '00000000-0000-0000-0000-000000000002';
const BADGE_ID = '00000000-0000-0000-0000-000000000003';

function serviceWith({
  storageConfigured = true,
  badgeCount = 0,
  deleteResult = { removedCount: 1, clearedCount: 0 },
} = {}) {
  const generation = {
    id: GENERATION_ID,
    userId: USER_ID,
    prompt: 'weekend coding cafe',
    provider: 'test-provider',
    model: 'test-model',
    imageObjectKey: `badges/generations/${USER_ID}/image.png`,
    pointCost: 0,
    status: 'preview',
    createdAt: new Date().toISOString(),
  };
  const badge = {
    id: BADGE_ID,
    title: 'Weekend Coder',
    description: generation.prompt,
    imageObjectKey: generation.imageObjectKey,
    provider: generation.provider,
    model: generation.model,
    prompt: generation.prompt,
    createdAt: new Date().toISOString(),
  };
  const calls = { putObject: [], queries: [] };

  const db = {
    query: async (sql, params = []) => {
      calls.queries.push(sql);
      if (sql.includes('SELECT COUNT(*)::int AS count')) return { rows: [{ count: badgeCount }] };
      if (sql.includes('WITH removed AS')) return { rows: [deleteResult] };
      if (sql.includes('INSERT INTO badge_generations')) return { rows: [generation] };
      if (sql.includes('FROM badge_generations')) return { rows: [generation] };
      if (sql.includes('UPDATE users u')) {
        // setActiveBadge: 소유한 뱃지일 때만 row를 반환한다.
        if (params[1] !== BADGE_ID) return { rows: [] };
        return { rows: [{ ...badge, awardedAt: badge.createdAt, isActive: true }] };
      }
      if (sql.includes('JOIN badges b ON b.id = u.active_badge_id')) {
        return { rows: [{ ...badge, awardedAt: badge.createdAt, isActive: true }] };
      }
      if (sql.includes('FROM user_badges')) {
        return { rows: [{ ...badge, awardedAt: badge.createdAt, isActive: true }] };
      }
      return { rows: [] };
    },
    transaction: async (callback) => callback({
      query: async (sql) => {
        if (sql.includes('FROM badge_generations')) return { rows: [generation] };
        if (sql.includes('FOR UPDATE')) return { rows: [{ id: USER_ID }] };
        if (sql.includes('SELECT COUNT(*)::int AS count')) return { rows: [{ count: badgeCount }] };
        if (sql.includes('INSERT INTO badges')) return { rows: [badge] };
        if (sql.includes('UPDATE users SET active_badge_id')) {
          return { rows: [{ activeBadgeId: badge.id }] };
        }
        return { rows: [] };
      },
    }),
  };
  const storage = {
    status: () => ({ configured: storageConfigured }),
    putObject: async (input) => {
      calls.putObject.push(input);
      return { objectKey: input.objectKey };
    },
    createDownloadUrl: async (objectKey) => `signed:${objectKey}`,
  };
  const badgeProvider = {
    provider: 'test-provider',
    model: 'test-model',
    generateImage: async () => {
      calls.generateImage = (calls.generateImage ?? 0) + 1;
      return {
        body: Buffer.from('image'),
        contentType: 'image/png',
      };
    },
  };

  return { service: createBadgesService({ db, storage, badgeProvider }), calls };
}

test('generateBadge creates a preview generation and stores the image', async () => {
  const { service, calls } = serviceWith();

  const result = await service.generateBadge({ userId: USER_ID, prompt: 'weekend coding cafe' });

  assert.equal(result.id, GENERATION_ID);
  assert.equal(result.pointCost, 0);
  assert.equal(result.imageViewUrl, `signed:${result.imageObjectKey}`);
  assert.equal(calls.putObject.length, 1);
  assert.equal(calls.putObject[0].contentType, 'image/png');
});

test('applyGeneration creates a user badge from a preview generation', async () => {
  const { service } = serviceWith();

  const result = await service.applyGeneration({
    userId: USER_ID,
    generationId: GENERATION_ID,
    title: 'Weekend Coder',
  });

  assert.equal(result.id, BADGE_ID);
  assert.equal(result.title, 'Weekend Coder');
  assert.equal(result.isActive, true);
  assert.equal(result.imageViewUrl, `signed:${result.imageObjectKey}`);
});

test('applyGeneration rejects a non-uuid generation id with 404 before querying the db', async () => {
  const { service, calls } = serviceWith();

  await assert.rejects(
    () => service.applyGeneration({ userId: USER_ID, generationId: 'not-a-uuid', title: 'x' }),
    (err) => err.statusCode === 404 && err.code === 'BADGE_GENERATION_NOT_FOUND',
  );
  assert.equal(calls.queries.length, 0);
});

test('setActiveBadge switches the active user badge', async () => {
  const { service } = serviceWith();

  const result = await service.setActiveBadge({ userId: USER_ID, badgeId: BADGE_ID });

  assert.equal(result.id, BADGE_ID);
  assert.equal(result.isActive, true);
  assert.equal(result.imageViewUrl, `signed:${result.imageObjectKey}`);
});

test('setActiveBadge rejects a non-uuid badge id with 404 before querying the db', async () => {
  const { service, calls } = serviceWith();

  await assert.rejects(
    () => service.setActiveBadge({ userId: USER_ID, badgeId: 'abc' }),
    (err) => err.statusCode === 404 && err.code === 'BADGE_NOT_FOUND',
  );
  assert.equal(calls.queries.length, 0);
});

test('setActiveBadge rejects a badge the user does not own with 404', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.setActiveBadge({
      userId: USER_ID,
      badgeId: '00000000-0000-0000-0000-0000000000ff',
    }),
    (err) => err.statusCode === 404 && err.code === 'BADGE_NOT_FOUND',
  );
});

test('generateBadge is blocked at the 5-badge limit before calling the provider', async () => {
  const { service, calls } = serviceWith({ badgeCount: 5 });

  await assert.rejects(
    () => service.generateBadge({ userId: USER_ID, prompt: 'weekend coding cafe' }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
  assert.equal(calls.generateImage ?? 0, 0);
});

test('applyGeneration is blocked at the 5-badge limit inside the transaction', async () => {
  const { service } = serviceWith({ badgeCount: 5 });

  await assert.rejects(
    () => service.applyGeneration({ userId: USER_ID, generationId: GENERATION_ID, title: 'x' }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});

test('deleteBadge removes an owned badge and reports active-badge clearing', async () => {
  const { service } = serviceWith({ deleteResult: { removedCount: 1, clearedCount: 1 } });

  const result = await service.deleteBadge({ userId: USER_ID, badgeId: BADGE_ID });

  assert.equal(result.deleted, true);
  assert.equal(result.clearedActive, true);
});

test('deleteBadge rejects a badge the user does not own with 404', async () => {
  const { service } = serviceWith({ deleteResult: { removedCount: 0, clearedCount: 0 } });

  await assert.rejects(
    () => service.deleteBadge({ userId: USER_ID, badgeId: BADGE_ID }),
    (err) => err.statusCode === 404 && err.code === 'BADGE_NOT_FOUND',
  );
});

test('deleteBadge rejects a non-uuid badge id with 404 before querying the db', async () => {
  const { service, calls } = serviceWith();

  await assert.rejects(
    () => service.deleteBadge({ userId: USER_ID, badgeId: 'abc' }),
    (err) => err.statusCode === 404 && err.code === 'BADGE_NOT_FOUND',
  );
  assert.equal(calls.queries.length, 0);
});

test('generateBadge rejects an empty prompt', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.generateBadge({ userId: USER_ID, prompt: '   ' }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});

test('generateBadge checks storage before calling the image provider', async () => {
  const { service, calls } = serviceWith({ storageConfigured: false });

  await assert.rejects(
    () => service.generateBadge({ userId: USER_ID, prompt: 'weekend coding cafe' }),
    (err) => err.statusCode === 503 && err.code === 'STORAGE_NOT_CONFIGURED',
  );
  assert.equal(calls.generateImage ?? 0, 0);
});
