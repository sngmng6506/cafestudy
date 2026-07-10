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

test('normalizeSearchText: 한글 문장과 구두점을 검색 가능한 형태로 정규화한다', () => {
  assert.equal(normalizeSearchText('  지난번 모임, 사진!  '), '지난번 모임 사진');
});

test('menu search metadata: 모든 feature 이름이 유일하고 검색 문장이 존재한다', () => {
  const names = menuSearchMetadata.map((item) => item.featureName);
  assert.equal(new Set(names).size, names.length);

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
  ];

  for (const [query, expectedFeature] of cases) {
    const [first] = searchMenusByKeyword(query);
    assert.equal(first?.featureName, expectedFeature, query);
  }
});

test('searchMenusByKeyword: 빈 검색어는 결과를 반환하지 않는다', () => {
  assert.deepEqual(searchMenusByKeyword('   '), []);
});
