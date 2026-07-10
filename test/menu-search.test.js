import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchText,
  searchMenusByKeyword,
} from '../client/src/features/menu-search/menu-search.keyword.js';
import {
  buildMenuSearchEntries,
  menuSearchMetadata,
} from '../client/src/features/menu-search/menu-search.metadata.js';
import { searchMenus } from '../client/src/features/menu-search/menu-search.service.js';

test('normalizeSearchText: 한글 문장과 구두점을 검색 가능한 형태로 정규화한다', () => {
  assert.equal(normalizeSearchText('  지난번 모임, 사진!  '), '지난번 모임 사진');
});

test('menu search metadata: 모든 feature 이름이 유일하고 검색 문장이 존재한다', () => {
  const names = menuSearchMetadata.map((item) => item.featureName);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('search-guide'));

  for (const item of menuSearchMetadata) {
    assert.ok(item.description.length > 0);
    assert.ok(item.searchTerms.length > 0);
    assert.ok(item.examples.length > 0);
  }

  const entries = buildMenuSearchEntries();
  assert.ok(entries.length > menuSearchMetadata.length);
});

test('searchMenusByKeyword: 직접적인 사용자 표현을 관련 메뉴로 연결한다', () => {
  const cases = [
    ['사진 올리고 포인트 받고 싶어', 'verifications'],
    ['이번 달 1등 누구야', 'ranking'],
    ['전에 갔던 카페가 어디였지', 'cafes'],
    ['지난번 스터디 사진 보고 싶어', 'meetup-history'],
    ['친구에게 사이트 공유하고 싶어', 'qr'],
    ['검색이 어떻게 동작해?', 'search-guide'],
  ];

  for (const [query, expectedFeature] of cases) {
    const [first] = searchMenusByKeyword(query);
    assert.equal(first?.featureName, expectedFeature, query);
  }
});

test('searchMenusByKeyword: 빈 검색어는 결과를 반환하지 않는다', () => {
  assert.deepEqual(searchMenusByKeyword('   '), []);
});

test('searchMenus: 한국어 키워드 점수를 의미 점수보다 우선한다', async () => {
  const metadata = [
    {
      featureName: 'keyword-first',
      description: '사진을 올려 참여를 인증합니다.',
      searchTerms: ['사진 인증'],
      examples: ['사진 올리고 싶어'],
    },
    {
      featureName: 'semantic-first',
      description: '다른 기능입니다.',
      searchTerms: ['다른 기능'],
      examples: ['전혀 다른 요청'],
    },
  ];

  const response = await searchMenus('사진 인증', {
    metadata,
    semanticSearch: async () => [
      { featureName: 'semantic-first', score: 1, matchedText: 'semantic match' },
      { featureName: 'keyword-first', score: 0, matchedText: 'weak semantic match' },
    ],
  });

  assert.equal(response.mode, 'hybrid');
  assert.equal(response.results[0]?.featureName, 'keyword-first');
  assert.equal(response.results[0]?.matchedText, '사진 인증');
});

test('searchMenus: 의미 검색 실패 시 키워드 결과로 폴백한다', async () => {
  let reportedError;
  const response = await searchMenus('이번 달 1등 누구야', {
    semanticSearch: async () => {
      throw new Error('WASM unavailable');
    },
    onSemanticError(error) {
      reportedError = error;
    },
  });

  assert.equal(response.mode, 'keyword');
  assert.equal(response.results[0]?.featureName, 'ranking');
  assert.equal(reportedError?.message, 'WASM unavailable');
});
