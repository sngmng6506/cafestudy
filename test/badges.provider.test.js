import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHuggingFaceBadgeProvider } from '../src/features/badges/huggingface.provider.js';

test('provider uses injected configuration and router endpoint', async () => {
  let requestedUrl = '';
  const provider = createHuggingFaceBadgeProvider(
    { token: 'hf_test', model: 'owner/model', requestTimeoutMs: 1000 },
    async (url) => {
      requestedUrl = url;
      return new Response(Buffer.from('image'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    },
  );
  await provider.generateImage('pixel badge');
  assert.equal(requestedUrl, 'https://router.huggingface.co/hf-inference/models/owner/model');
});

test('provider rejects a response larger than the configured limit', async () => {
  const provider = createHuggingFaceBadgeProvider(
    { token: 'hf_test', maxResponseBytes: 3 },
    async () => new Response(Buffer.from('image'), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }),
  );
  await assert.rejects(
    () => provider.generateImage('pixel badge'),
    (error) => error.code === 'BADGE_IMAGE_TOO_LARGE',
  );
});

test('provider reports unsupported models distinctly', async () => {
  const provider = createHuggingFaceBadgeProvider(
    { token: 'hf_test' },
    async () => new Response(JSON.stringify({ error: 'Model not supported' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
  );
  await assert.rejects(
    () => provider.generateImage('pixel badge'),
    (error) => error.code === 'BADGE_MODEL_UNSUPPORTED',
  );
});
