import { createCafesQueries } from './cafes.queries.js';
import { throwValidation, throwForbidden } from '../../shared/errors.js';
import { searchPlaces } from '../../shared/kakao-local.js';

const RESOLVE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const RESOLVE_BATCH = 5;

// 장소 문자열을 검색어 후보로 바꾼다.
//
// 괄호를 벗기는 것까지만 한다. 앱 모임은 "아비아채 서울홍대점 (서울 마포구 ...)"로
// 저장되는데 주소가 붙은 통짜 문자열로는 검색이 안 되기 때문이다.
//
// 단어를 하나씩 떼며 재시도하지는 않는다. 그건 네이버 시절 보조 로직인데, 카카오와
// 쓰면 오히려 해가 된다 — "아비아채 지하1층"에서 뒷단어를 떼면 "아비아채"가 되고,
// 그건 전혀 다른 지점(아비아채 하사정1920)을 물어온다. 카카오가 확신 없을 때 빈
// 결과를 주는 것이 이 용도의 장점인데, 깎아낸 검색어로 그 장점을 지워버린다.
// 못 찾으면 못 찾은 채로 두는 편이 남의 카페에 이력을 붙이는 것보다 낫다.
export function geocodeCandidates(location) {
  const candidates = [];
  const push = (value) => {
    // 괄호를 지우면 짝 없는 괄호 문자가 남을 수 있다("...(태평로1가))" 같은 중첩).
    const v = value.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (v.length >= 2 && !candidates.includes(v)) candidates.push(v);
  };
  push(location);
  push(location.replace(/\([^)]*\)/g, ' '));
  // 앱 모임은 항상 "이름 (주소)" 형태라 첫 괄호 앞이 상호명이다. 위의 괄호 제거는
  // 주소 안에 괄호가 또 있으면("...무교로 21 (무교동) 코오롱빌딩 1층") 짝이 어긋나
  // 엉뚱한 조각이 남는다.
  push(location.split('(')[0]);
  return candidates;
}

export function foldByPlaceId(cafes) {
  const merged = new Map();

  for (const cafe of cafes.values()) {
    const key = cafe.placeId ? `id:${cafe.placeId}` : `raw:${cafe.location}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...cafe, locations: [cafe.location] });
      continue;
    }

    current.meetupCount += cafe.meetupCount;
    current.canComment = current.canComment || cafe.canComment;
    current.comments = [...current.comments, ...cafe.comments];
    current.locations.push(cafe.location);
    if (!current.lastVisitedAt || new Date(cafe.lastVisitedAt) > new Date(current.lastVisitedAt)) {
      current.lastVisitedAt = cafe.lastVisitedAt;
    }
    // 표시 이름은 검색이 돌려준 상호명을 쓴다. 원본 문자열 중 무엇을 고를지
    // 고민할 필요가 없고, 합쳐진 항목끼리도 같은 이름으로 보인다.
    current.location = current.placeName ?? current.location;
  }

  return [...merged.values()];
}

export function createCafesService({ db, storage, config = {}, searchPlacesFn }) {
  const queries = createCafesQueries(db);
  const placeSearch = searchPlacesFn ?? ((query) => searchPlaces(query, config.kakao ?? {}));

  return {
    async listCafes(userId) {
      const [internalRows, somoimRows, comments] = await Promise.all([
        queries.listInternalCafeVisits(userId),
        queries.listSomoimCafeVisits(userId),
        queries.listComments(userId),
      ]);
      const cafes = new Map();
      for (const row of [...internalRows, ...somoimRows]) {
        const current = cafes.get(row.location) ?? {
          location: row.location,
          meetupCount: 0,
          lastVisitedAt: null,
          canComment: false,
          comments: [],
        };
        current.meetupCount += Number(row.meetupCount ?? 0);
        current.canComment = current.canComment || row.canComment;
        if (!current.lastVisitedAt || new Date(row.lastVisitedAt) > new Date(current.lastVisitedAt)) {
          current.lastVisitedAt = row.lastVisitedAt;
        }
        cafes.set(row.location, current);
      }
      for (const comment of comments) {
        const cafe = cafes.get(comment.location);
        if (cafe) cafe.comments.push(comment);
      }
      await attachPlaces(cafes);
      return foldByPlaceId(cafes).sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
    },

    async listCafePhotos({ userId, location }) {
      const normalizedLocation = (location ?? '').toString().trim();
      if (!normalizedLocation) throwValidation('카페 정보가 필요합니다.');
      const photos = await queries.listCafePhotos({ userId, location: normalizedLocation });
      return Promise.all(photos.map(async ({ photoUrl, ...photo }) => ({
        ...photo,
        photoViewUrl: await resolvePhotoUrl(photoUrl),
      })));
    },

    async upsertComment({ userId, location, body, isAnonymous }) {
      const normalizedLocation = (location ?? '').toString().trim();
      const normalizedBody = (body ?? '').toString().replace(/\s+/g, ' ').trim();
      if (!normalizedLocation) throwValidation('카페 정보가 필요합니다.');
      if (!normalizedBody || normalizedBody.length > 120) throwValidation('코멘트는 1~120자로 입력해주세요.');
      if (!(await queries.hasVisitedCafe({ userId, location: normalizedLocation }))) {
        throwForbidden('COMMENT_NOT_ALLOWED', '참석 이력이 있는 카페에만 코멘트를 남길 수 있습니다.');
      }
      return queries.upsertComment({
        userId,
        location: normalizedLocation,
        body: normalizedBody,
        isAnonymous: Boolean(isAnonymous),
      });
    },
  };

  async function attachPlaces(cafes) {
    const places = await queries.listCafePlaces();
    const placeByLocation = new Map(places.map((p) => [p.location, p]));
    const unresolved = [...cafes.keys()].filter((location) => {
      const place = placeByLocation.get(location);
      if (!place) return true;
      if (place.lat != null) return false;
      return Date.now() - new Date(place.resolvedAt).getTime() > RESOLVE_RETRY_MS;
    }).slice(0, RESOLVE_BATCH);

    for (const location of unresolved) {
      const resolved = await resolvePlace(location);
      if (resolved) placeByLocation.set(location, resolved);
    }
    for (const cafe of cafes.values()) {
      const place = placeByLocation.get(cafe.location);
      cafe.placeName = place?.placeName ?? null;
      cafe.roadAddress = place?.roadAddress ?? null;
      cafe.lat = place?.lat ?? null;
      cafe.lng = place?.lng ?? null;
      // 합치는 기준. 없으면 이 항목은 혼자 남는다(foldByPlaceId 참고).
      cafe.placeId = place?.kakaoPlaceId ?? null;
      cafe.placeUrl = place?.placeUrl ?? null;
    }
  }

  async function resolvePlace(location) {
    if (location.trim().length < 2) return null;
    let found = null;
    try {
      for (const query of geocodeCandidates(location)) {
        const results = await placeSearch(query);
        found = results[0] ?? null;
        if (found?.lat != null) break;
      }
    } catch (error) {
      if (error.code === 'PLACES_NOT_CONFIGURED') return null;
    }
    return queries.upsertCafePlace({
      location,
      placeName: found?.placeName ?? null,
      roadAddress: found?.roadAddress ?? null,
      lat: found?.lat ?? null,
      lng: found?.lng ?? null,
      kakaoPlaceId: found?.placeId ?? null,
      placeUrl: found?.placeUrl ?? null,
    });
  }

  async function resolvePhotoUrl(photoUrl) {
    if (!photoUrl || /^https?:\/\//i.test(photoUrl)) return null;
    try { return await storage?.createDownloadUrl(photoUrl); }
    catch { return null; }
  }
}
