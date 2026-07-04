import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBadgesService } from '../src/features/badges/badges.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function serviceWith({ storageConfigured = true } = {}) {
  const generation = {
    id: 'gen-1',
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
    id: 'badge-1',
    title: 'Weekend Coder',
    description: generation.prompt,
    imageObjectKey: generation.imageObjectKey,
    provider: generation.provider,
    model: generation.model,
    prompt: generation.prompt,
    createdAt: new Date().toISOString(),
  };
  const calls = { putObject: [] };

  const db = {
    query: async (sql) => {
      if (sql.includes('INSERT INTO badge_generations')) return { rows: [generation] };
      if (sql.includes('FROM badge_generations')) return { rows: [generation] };
      if (sql.includes('FROM user_badges')) return { rows: [badge] };
      return { rows: [] };
    },
    transaction: async (callback) => callback({
      query: async (sql) => {
        if (sql.includes('FROM badge_generations')) return { rows: [generation] };
        if (sql.includes('INSERT INTO badges')) return { rows: [badge] };
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

  assert.equal(result.id, 'gen-1');
  assert.equal(result.pointCost, 0);
  assert.equal(result.imageViewUrl, `signed:${result.imageObjectKey}`);
  assert.equal(calls.putObject.length, 1);
  assert.equal(calls.putObject[0].contentType, 'image/png');
});

test('applyGeneration creates a user badge from a preview generation', async () => {
  const { service } = serviceWith();

  const result = await service.applyGeneration({
    userId: USER_ID,
    generationId: 'gen-1',
    title: 'Weekend Coder',
  });

  assert.equal(result.id, 'badge-1');
  assert.equal(result.title, 'Weekend Coder');
  assert.equal(result.imageViewUrl, `signed:${result.imageObjectKey}`);
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
