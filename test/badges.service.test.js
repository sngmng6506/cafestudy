import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBadgesService } from '../src/features/badges/badges.service.js';

const USER = '00000000-0000-0000-0000-000000000001';
const GENERATION = '00000000-0000-0000-0000-000000000002';
const BADGE = '00000000-0000-0000-0000-000000000003';

function serviceWith({ reserveOutcome = 'created', badgeCount = 0, providerError = null } = {}) {
  const calls = { provider: 0, put: 0, fail: 0, delete: 0 };
  const generation = {
    id: GENERATION,
    userId: USER,
    prompt: 'coding cafe',
    provider: 'test',
    model: 'test-model',
    imageObjectKey: `badges/generations/${USER}/${GENERATION}.png`,
    pointCost: 0,
    status: 'preview',
  };
  const badge = {
    id: BADGE,
    title: 'Coder',
    imageObjectKey: generation.imageObjectKey,
    prompt: generation.prompt,
  };
  const queries = {
    async countUserBadges() { return badgeCount; },
    async reserveGeneration() { return { outcome: reserveOutcome, generation }; },
    async completeGeneration() { return generation; },
    async failGeneration() { calls.fail += 1; },
    async getGenerationForUser() { return generation; },
    async createBadgeFromGeneration() { return { ...badge, isActive: true }; },
    async listUserBadges() { return []; },
    async getActiveBadge() { return null; },
    async deleteUserBadge() { return { removed: true, clearedActive: false }; },
    async setActiveBadge() { return badge; },
  };
  const provider = {
    provider: 'test',
    model: 'test-model',
    async generateImage() {
      calls.provider += 1;
      if (providerError) throw providerError;
      return { body: Buffer.from('image'), contentType: 'image/png' };
    },
  };
  const storage = {
    status: () => ({ configured: true }),
    async putObject() { calls.put += 1; },
    async deleteObject() { calls.delete += 1; },
    async createDownloadUrl(key) { return `signed:${key}`; },
  };
  return {
    calls,
    service: createBadgesService({
      storage,
      badgeProvider: provider,
      badgeQueries: queries,
      config: { badges: { dailyGenerationLimit: 3 } },
    }),
  };
}

test('generation reserves quota before calling the paid provider', async () => {
  const { service, calls } = serviceWith({ reserveOutcome: 'daily_limit' });
  await assert.rejects(
    () => service.generateBadge({ userId: USER, prompt: 'coding cafe' }),
    (error) => error.statusCode === 429 && error.code === 'BADGE_DAILY_LIMIT',
  );
  assert.equal(calls.provider, 0);
  assert.equal(calls.put, 0);
});

test('only one generation may run for a user at a time', async () => {
  const { service, calls } = serviceWith({ reserveOutcome: 'in_progress' });
  await assert.rejects(
    () => service.generateBadge({ userId: USER, prompt: 'coding cafe' }),
    (error) => error.statusCode === 409 && error.code === 'BADGE_GENERATION_IN_PROGRESS',
  );
  assert.equal(calls.provider, 0);
});

test('successful generation stores one image and returns a preview', async () => {
  const { service, calls } = serviceWith();
  const result = await service.generateBadge({ userId: USER, prompt: 'coding cafe' });
  assert.equal(result.status, 'preview');
  assert.equal(calls.provider, 1);
  assert.equal(calls.put, 1);
  assert.match(result.imageViewUrl, /^signed:/);
});

test('provider failure marks the reserved attempt as failed', async () => {
  const providerError = Object.assign(new Error('timeout'), { code: 'BADGE_GENERATION_TIMEOUT' });
  const { service, calls } = serviceWith({ providerError });
  await assert.rejects(() => service.generateBadge({ userId: USER, prompt: 'coding cafe' }));
  assert.equal(calls.fail, 1);
  assert.equal(calls.put, 0);
});

test('five owned badges still block generation before quota reservation', async () => {
  const { service, calls } = serviceWith({ badgeCount: 5 });
  await assert.rejects(
    () => service.generateBadge({ userId: USER, prompt: 'coding cafe' }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
  assert.equal(calls.provider, 0);
});
