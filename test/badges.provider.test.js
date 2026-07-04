import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHuggingFaceBadgeProvider } from '../src/features/badges/huggingface.provider.js';

test('Hugging Face provider uses the router endpoint by default', async () => {
  let requestedUrl = '';
  let acceptHeader = '';
  const provider = createHuggingFaceBadgeProvider(
    { HF_TOKEN: 'hf_test', HF_BADGE_MODEL: 'owner/model' },
    async (url, init) => {
      requestedUrl = url;
      acceptHeader = init.headers.Accept;
      return new Response(Buffer.from('image'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    },
  );

  await provider.generateImage('pixel badge');

  assert.equal(requestedUrl, 'https://router.huggingface.co/hf-inference/models/owner/model');
  assert.equal(acceptHeader, 'image/png');
});

test('Hugging Face provider wraps network failures', async () => {
  const provider = createHuggingFaceBadgeProvider(
    { HF_TOKEN: 'hf_test' },
    async () => {
      throw new TypeError('fetch failed');
    },
  );

  await assert.rejects(
    () => provider.generateImage('pixel badge'),
    (error) =>
      error.statusCode === 503 &&
      error.code === 'BADGE_GENERATION_UNREACHABLE' &&
      error.message.includes('fetch failed'),
  );
});

test('Hugging Face provider reports unsupported models distinctly', async () => {
  const provider = createHuggingFaceBadgeProvider(
    { HF_TOKEN: 'hf_test' },
    async () =>
      new Response(JSON.stringify({ error: 'Model not supported for provider hf-inference' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
  );

  await assert.rejects(
    () => provider.generateImage('pixel badge'),
    (error) => error.statusCode === 503 && error.code === 'BADGE_MODEL_UNSUPPORTED',
  );
});
