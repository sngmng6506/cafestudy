import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCafesService } from '../src/features/cafes/cafes.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function serviceWith({ places = [], searchResults = [], searchError = null } = {}) {
  const calls = { search: [], upserts: [] };

  const db = {
    query: async (sql, params = []) => {
      if (sql.includes('FROM meetups m')) {
        return {
          rows: [
            { location: '아비아채', meetupCount: 2, lastVisitedAt: '2026-07-01', canComment: true },
          ],
        };
      }
      if (sql.includes('FROM somoim_events e')) return { rows: [] };
      if (sql.includes('FROM cafe_comments c')) return { rows: [] };
      if (sql.includes('FROM cafe_places')) return { rows: places };
      if (sql.includes('INSERT INTO cafe_places')) {
        const [location, placeName, roadAddress, lat, lng] = params;
        const row = { location, placeName, roadAddress, lat, lng, resolvedAt: new Date().toISOString() };
        calls.upserts.push(row);
        return { rows: [row] };
      }
      if (sql.includes('FROM verifications v')) {
        return {
          rows: [
            { id: 'v1', photoUrl: 'photos/a.jpg', createdAt: '2026-07-01', meetupTitle: '모임' },
            { id: 'v2', photoUrl: 'https://cdn.example.com/b.jpg', createdAt: '2026-07-01', meetupTitle: '모임' },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const storage = { createDownloadUrl: async (key) => `signed:${key}` };
  const searchPlacesFn = async (query) => {
    calls.search.push(query);
    if (searchError) throw searchError;
    return searchResults;
  };

  return { service: createCafesService({ db, storage, searchPlacesFn }), calls };
}

test('listCafes: 캐시에 없는 위치는 지오코딩해서 좌표를 붙인다', async () => {
  const { service, calls } = serviceWith({
    searchResults: [{ placeName: '아비아채', roadAddress: '수원 팔달구', lat: 37.28, lng: 127.01 }],
  });

  const cafes = await service.listCafes(USER_ID);

  assert.deepEqual(calls.search, ['아비아채']);
  assert.equal(calls.upserts.length, 1);
  assert.equal(cafes[0].lat, 37.28);
  assert.equal(cafes[0].placeName, '아비아채');
});

test('listCafes: 캐시된 좌표가 있으면 지오코딩하지 않는다', async () => {
  const { service, calls } = serviceWith({
    places: [{ location: '아비아채', placeName: '아비아채', roadAddress: null, lat: 37.28, lng: 127.01, resolvedAt: new Date().toISOString() }],
  });

  const cafes = await service.listCafes(USER_ID);

  assert.equal(calls.search.length, 0);
  assert.equal(cafes[0].lat, 37.28);
});

test('listCafes: 최근 실패한 위치는 재시도하지 않는다', async () => {
  const { service, calls } = serviceWith({
    places: [{ location: '아비아채', placeName: null, roadAddress: null, lat: null, lng: null, resolvedAt: new Date().toISOString() }],
  });

  const cafes = await service.listCafes(USER_ID);

  assert.equal(calls.search.length, 0);
  assert.equal(cafes[0].lat, null);
});

test('listCafes: 검색 API 미설정이면 실패를 기록하지 않는다 (설정 후 재시도되도록)', async () => {
  const notConfigured = Object.assign(new Error('not configured'), { code: 'PLACES_NOT_CONFIGURED' });
  const { service, calls } = serviceWith({ searchError: notConfigured });

  await service.listCafes(USER_ID);

  assert.equal(calls.upserts.length, 0);
});

test('listCafePhotos: 오브젝트 키는 서명하고 외부 URL은 그대로 둔다', async () => {
  const { service } = serviceWith();

  const photos = await service.listCafePhotos({ userId: USER_ID, location: '아비아채' });

  assert.equal(photos[0].photoViewUrl, 'signed:photos/a.jpg');
  assert.equal(photos[1].photoViewUrl, 'https://cdn.example.com/b.jpg');
});

test('listCafePhotos: 위치가 비면 검증 에러', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.listCafePhotos({ userId: USER_ID, location: '  ' }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});
