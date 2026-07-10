import assert from 'node:assert/strict';
import test from 'node:test';

import { createSemanticMenuIndex, searchMenusBySemantic } from '../client/src/features/menu-search/menu-search.semantic.js';
import { searchMenus } from '../client/src/features/menu-search/menu-search.service.js';

const metadata = [
  {
    featureName: 'history',
    description: '지난 활동과 사진을 확인한다',
    searchTerms: ['과거 기록'],
    examples: ['예전 모임을 보고 싶다'],
  },
  {
    featureName: 'badges',
    description: '프로필 뱃지를 만든다',
    searchTerms: ['프로필 꾸미기'],
    examples: ['아이콘을 바꾸고 싶다'],
  },
];

function createFakeEngine() {
  const vocabulary = ['지난', '예전', '사진', '기록', '프로필', '뱃지', '아이콘', '꾸미'];
  return {
    embed(text) {
      return Float32Array.from(vocabulary.map((word) => text.includes(word) ? 1 : 0));
    },
    cosineSim(a, b) {
      let dot = 0;
      let aNorm = 0;
      let bNorm = 0;
      for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        aNorm += a[i] ** 2;
        bNorm += b[i] ** 2;
      }
      if (!aNorm || !bNorm) return 0;
      return dot / Math.sqrt(aNorm * bNorm);
    },
  };
}

test('semantic index: metadata의 모든 검색 문장을 한 번씩 임베딩한다', async () => {
  const engine = createFakeEngine();
  const index = await createSemanticMenuIndex({ metadata, loadEngine: async () => engine });

  assert.equal(index.length, 6);
  assert.ok(index.every((entry) => entry.vector instanceof Float32Array));
});

test('semantic search: 메뉴별 최고 문장 점수로 순위를 만든다', async () => {
  const engine = createFakeEngine();
  const results = await searchMenusBySemantic('예전 사진 보여줘', {
    metadata,
    loadEngine: async () => engine,
  });

  assert.equal(results[0].featureName, 'history');
  assert.match(results[0].matchedText, /지난|예전|사진/);
});

test('hybrid search: 의미 점수와 키워드 점수를 결합한다', async () => {
  const semanticSearch = async () => [
    { featureName: 'badges', score: 0.9, matchedText: '프로필 뱃지를 만든다' },
    { featureName: 'history', score: 0.2, matchedText: '지난 활동과 사진을 확인한다' },
  ];

  const { mode, results } = await searchMenus('프로필을 새롭게 꾸미고 싶어', {
    metadata,
    semanticSearch,
  });

  assert.equal(mode, 'hybrid');
  assert.equal(results[0].featureName, 'badges');
  assert.ok(results[0].semanticScore > results[0].keywordScore);
});

test('hybrid search: Ternlight 실패 시 키워드 검색으로 폴백한다', async () => {
  let capturedError;
  const { mode, results } = await searchMenus('과거 기록', {
    metadata,
    semanticSearch: async () => { throw new Error('WASM unavailable'); },
    onSemanticError: (error) => { capturedError = error; },
  });

  assert.equal(mode, 'keyword');
  assert.equal(results[0].featureName, 'history');
  assert.equal(capturedError.message, 'WASM unavailable');
});
