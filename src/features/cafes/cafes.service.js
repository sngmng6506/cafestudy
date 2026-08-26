import { createCafesQueries } from './cafes.queries.js';
import { throwValidation, throwForbidden } from '../../shared/errors.js';
import { searchPlaces } from '../../shared/kakao-local.js';

const RESOLVE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const RESOLVE_BATCH = 5;

export function geocodeCandidates(location) {
  const candidates = [];
  const push = (value) => {
    const v = value.replace(/\s+/g, ' ').trim();
    if (v.length >= 2 && !candidates.includes(v)) candidates.push(v);
  };
  push(location);
  const withoutParens = location.replace(/\([^)]*\)/g, ' ');
  push(withoutParens);
  let words = withoutParens.replace(/\s+/g, ' ').trim().split(' ');
  for (let i = 0; i < 2 && words.length > 1; i += 1) {
    words = words.slice(0, -1);
    push(words.join(' '));
  }
  return candidates;
}


// 같은 장소 ID를 가리키는 항목을 하나로 합친다. 문자열로만 묶으면 같은 카페가
// 출처마다 다르게 적혀 갈라진다 — 앱 모임은 "이름 (도로명주소)"로, 크롤링 정모는
// 사람이 앱에 적은 대로("아비아채 지하1층") 들어오기 때문이다.
//
// 장소 ID가 없는 항목은 합치지 않는다. 카카오가 못 찾은 자유 입력인데, 억지로
// 좌표를 붙여 합치면 엉뚱한 카페에 남의 이력이 섞인다(네이버는 "정기모임장소 근처"를
// 고양시 스터디룸으로 자신 있게 돌려줬다). 갈라진 채 두는 편이 낫다.
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
