import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCafesService, foldByPlaceId, geocodeCandidates } from '../src/features/cafes/cafes.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function serviceWith({
  places = [],
  searchResults = [],
  searchError = null,
  searchImpl = null,
  location = '아비아채',
} = {}) {
  const calls = { search: [], upserts: [] };

  const db = {
    query: async (sql, params = []) => {
      if (sql.includes('FROM meetups m')) {
        return {
          rows: [
            { location, meetupCount: 2, lastVisitedAt: '2026-07-01', canComment: true },
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
    if (searchImpl) return searchImpl(query);
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

test('geocodeCandidates: 괄호를 벗기되 단어를 깎지는 않는다', () => {
  // 앱 모임은 "이름 (주소)"로 저장되므로 괄호를 벗겨야 검색이 된다.
  assert.deepEqual(geocodeCandidates('스타벅스 무교동점 (서울특별시 중구 무교로 21)'), [
    '스타벅스 무교동점 서울특별시 중구 무교로 21',
    '스타벅스 무교동점',
  ]);

  // 주소 안에 괄호가 또 있으면 짝이 어긋나 엉뚱한 조각이 남는다. 첫 괄호 앞이
  // 상호명이라는 사실로 보완한다.
  assert.ok(
    geocodeCandidates('스타벅스 무교동점 (서울 중구 무교로 21 (무교동) 코오롱빌딩)')
      .includes('스타벅스 무교동점'),
  );
});

test('geocodeCandidates: 꼬리 단어를 떼어내지 않는다', () => {
  // 회귀 방지. 예전에는 단어를 하나씩 떼며 재시도했는데, "아비아채 지하1층"에서
  // "지하1층"을 떼면 "아비아채"가 되고 그건 전혀 다른 지점(아비아채 하사정1920)을
  // 물어왔다. 카카오가 확신 없을 때 빈 결과를 주는 것이 이 용도의 장점인데,
  // 깎아낸 검색어가 그 장점을 지운다.
  assert.deepEqual(geocodeCandidates('아비아채 지하1층'), ['아비아채 지하1층']);
  assert.deepEqual(geocodeCandidates('카페미정 홍대근처'), ['카페미정 홍대근처']);
});

test('listCafes: 못 찾은 장소는 좌표 없이 그대로 남는다', async () => {
  // 억지로 비슷한 이름을 붙이지 않는다. 남의 카페에 이력이 섞이는 것보다
  // 갈라진 채 두는 편이 낫다.
  const { service, calls } = serviceWith({
    location: '아비아채 지하1층',
    searchImpl: () => [],
  });

  const cafes = await service.listCafes(USER_ID);

  assert.deepEqual(calls.search, ['아비아채 지하1층'], '깎은 검색어로 재시도하지 않는다');
  assert.equal(cafes[0].lat, null);
  assert.equal(cafes[0].placeId, null);
});

test('listCafes: 한 글자 위치는 지오코딩하지 않는다', async () => {
  const { service, calls } = serviceWith({ location: 'd' });

  const cafes = await service.listCafes(USER_ID);

  assert.equal(calls.search.length, 0);
  assert.equal(calls.upserts.length, 0);
  assert.equal(cafes[0].lat, null);
});

test('listCafePhotos: 오브젝트 키만 서명하고 외부 URL은 차단한다', async () => {
  const { service } = serviceWith();

  const photos = await service.listCafePhotos({ userId: USER_ID, location: '아비아채' });

  assert.equal(photos[0].photoViewUrl, 'signed:photos/a.jpg');
  assert.equal(photos[1].photoViewUrl, null);
});

test('listCafePhotos: 위치가 비면 검증 에러', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.listCafePhotos({ userId: USER_ID, location: '  ' }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});

// --- 코멘트 익명 옵션 ---
function commentServiceWith({ visited = true } = {}) {
  const calls = { upsert: [] };
  const db = {
    async query(sql, params) {
      if (sql.includes('AS allowed')) return { rows: [{ allowed: visited }] };
      if (sql.includes('INSERT INTO cafe_comments')) {
        const [location, userId, body, isAnonymous] = params;
        calls.upsert.push({ location, userId, body, isAnonymous });
        return { rows: [{ id: 'c1', location, body, isAnonymous }] };
      }
      return { rows: [] };
    },
  };
  return {
    service: createCafesService({ db, storage: {}, searchPlacesFn: async () => [] }),
    calls,
  };
}

test('upsertComment: isAnonymous를 boolean으로 변환해 저장한다', async () => {
  const { service, calls } = commentServiceWith();
  await service.upsertComment({ userId: USER_ID, location: '아비아채', body: '좋아요', isAnonymous: 'truthy' });
  assert.equal(calls.upsert[0].isAnonymous, true);
});

test('upsertComment: isAnonymous 미지정이면 false', async () => {
  const { service, calls } = commentServiceWith();
  await service.upsertComment({ userId: USER_ID, location: '아비아채', body: '좋아요' });
  assert.equal(calls.upsert[0].isAnonymous, false);
});

test('upsertComment: 방문 이력이 없으면 거부한다', async () => {
  const { service } = commentServiceWith({ visited: false });
  await assert.rejects(
    () => service.upsertComment({ userId: USER_ID, location: '아비아채', body: '좋아요' }),
    (err) => err.code === 'COMMENT_NOT_ALLOWED',
  );
});

// --- 장소 ID로 카페 합치기 ---

function cafeMap(entries) {
  return new Map(entries.map((entry) => [entry.location, {
    meetupCount: 1, lastVisitedAt: '2026-08-01', canComment: false, comments: [], ...entry,
  }]));
}

test('foldByPlaceId: 같은 장소 ID면 한 카페로 합친다', () => {
  // 같은 카페가 출처마다 다르게 적힌다. 앱 모임은 "이름 (도로명주소)"로,
  // 크롤링 정모는 사람이 앱에 적은 대로 들어온다.
  const folded = foldByPlaceId(cafeMap([
    { location: '디벙크 (합정)', placeId: '1040119941', placeName: '디벙크', meetupCount: 2 },
    { location: '디벙크 (서울특별시 마포구 성지1길 30)', placeId: '1040119941', placeName: '디벙크', meetupCount: 1, lastVisitedAt: '2026-08-20' },
  ]));

  assert.equal(folded.length, 1);
  assert.equal(folded[0].location, '디벙크', '표시 이름은 검색이 돌려준 상호명을 쓴다');
  assert.equal(folded[0].meetupCount, 3);
  assert.equal(folded[0].lastVisitedAt, '2026-08-20', '가장 최근 방문을 남긴다');
  assert.deepEqual(folded[0].locations, ['디벙크 (합정)', '디벙크 (서울특별시 마포구 성지1길 30)']);
});

test('foldByPlaceId: 장소 ID가 없으면 합치지 않는다', () => {
  // 카카오가 못 찾은 자유 입력이다. 좌표를 억지로 붙여 합치면 남의 카페에 이력이
  // 섞인다 — 실제로 "아비아채 지하1층"은 검색어를 깎으면 다른 지점을 물어왔다.
  const folded = foldByPlaceId(cafeMap([
    { location: '아비아채 지하1층', placeId: null, placeName: null },
    { location: '정기모임장소 근처', placeId: null, placeName: null },
  ]));

  assert.equal(folded.length, 2, '각자 남아야 한다');
  assert.deepEqual(folded.map((c) => c.location).sort(), ['아비아채 지하1층', '정기모임장소 근처']);
});

test('foldByPlaceId: ID 없는 항목끼리도 서로 합쳐지지 않는다', () => {
  // placeId가 둘 다 null이라고 같은 카페로 보면 안 된다.
  const folded = foldByPlaceId(cafeMap([
    { location: 'A 카페', placeId: null },
    { location: 'B 카페', placeId: null },
  ]));

  assert.equal(folded.length, 2);
});

test('foldByPlaceId: 코멘트와 코멘트 권한을 합친다', () => {
  const folded = foldByPlaceId(cafeMap([
    { location: '디벙크', placeId: '1', placeName: '디벙크', canComment: false, comments: [{ id: 'a' }] },
    { location: '디벙크 (합정)', placeId: '1', placeName: '디벙크', canComment: true, comments: [{ id: 'b' }] },
  ]));

  assert.equal(folded[0].canComment, true, '한쪽에서 방문했으면 코멘트할 수 있다');
  assert.deepEqual(folded[0].comments.map((c) => c.id), ['a', 'b']);
});
