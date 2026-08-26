import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createPlacesRouter } from '../src/features/places/places.routes.js';

test('places 라우터가 카카오 키를 검색 클라이언트로 넘긴다', async (t) => {
  const nativeFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response(JSON.stringify({ documents: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => { globalThis.fetch = nativeFetch; });

  const app = express();
  app.use('/api/places', createPlacesRouter({
    config: { kakao: { restApiKey: 'configured-rest-key' } },
  }));
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode ?? 500).json({ code: error.code });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const { port } = server.address();
  const response = await nativeFetch(`http://127.0.0.1:${port}/api/places/search?q=%EA%B0%95%EB%82%A8`);
  assert.equal(response.status, 200);
  assert.equal(upstreamRequest.options.headers.Authorization, 'KakaoAK configured-rest-key');
  
});
