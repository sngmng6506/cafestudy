import { createCafesQueries } from './cafes.queries.js';
import { throwValidation, throwForbidden } from '../../shared/errors.js';
import { searchPlaces } from '../../shared/naver-local.js';

// 지오코딩 실패(장소 검색 결과 없음)를 다시 시도하기까지의 유예.
const RESOLVE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
// 한 번의 목록 요청에서 지오코딩하는 최대 개수 — 응답 지연과 API 호출을 제한.
const RESOLVE_BATCH = 5;

// 지오코딩 검색어 후보. 원문이 실패하면 괄호 안 주소를 떼고, 그래도 실패하면
// "지하1층" 같은 꼬리 단어를 하나씩 줄여가며(최대 2회) 재시도한다.
// 예: "스타벅스 무교동점 (서울 중구 ...)" → "스타벅스 무교동점"
//     "아비아채 지하1층" → "아비아채"
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

export function createCafesService({ db, storage, searchPlacesFn = searchPlaces }) {
  const queries = createCafesQueries(db);

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
        if (!cafe) continue;
        cafe.comments.push(comment);
      }

      await attachPlaces(cafes);

      return [...cafes.values()].sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
    },

    // 마커 시트용 인증 사진. 공개 범위는 verifications와 동일(내가 낀 모임만).
    async listCafePhotos({ userId, location }) {
      const normalizedLocation = (location ?? '').toString().trim();
      if (!normalizedLocation) {
        throwValidation('카페 정보가 필요합니다.');
      }

      const photos = await queries.listCafePhotos({ userId, location: normalizedLocation });
      return Promise.all(
        photos.map(async ({ photoUrl, ...photo }) => ({
          ...photo,
          photoViewUrl: await resolvePhotoUrl(photoUrl),
        })),
      );
    },

    async upsertComment({ userId, location, body }) {
      const normalizedLocation = (location ?? '').toString().trim();
      const normalizedBody = (body ?? '').toString().replace(/\s+/g, ' ').trim();

      if (!normalizedLocation) {
        throwValidation('카페 정보가 필요합니다.');
      }
      if (!normalizedBody || normalizedBody.length > 120) {
        throwValidation('코멘트는 1~120자로 입력해주세요.');
      }

      const canComment = await queries.hasVisitedCafe({ userId, location: normalizedLocation });
      if (!canComment) {
        throwForbidden('COMMENT_NOT_ALLOWED', '참석 이력이 있는 카페에만 코멘트를 남길 수 있습니다.');
      }

      return queries.upsertComment({ userId, location: normalizedLocation, body: normalizedBody });
    },
  };

  // 카페들에 좌표(placeName/lat/lng)를 붙인다. 좌표는 cafe_places에 캐시되고,
  // 캐시에 없거나 실패한 지 오래된 위치만 요청당 RESOLVE_BATCH개까지 지오코딩.
  async function attachPlaces(cafes) {
    const places = await queries.listCafePlaces();
    const placeByLocation = new Map(places.map((p) => [p.location, p]));

    const unresolved = [...cafes.keys()]
      .filter((location) => {
        const place = placeByLocation.get(location);
        if (!place) return true;
        if (place.lat != null) return false;
        return Date.now() - new Date(place.resolvedAt).getTime() > RESOLVE_RETRY_MS;
      })
      .slice(0, RESOLVE_BATCH);

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
    }
  }

  async function resolvePlace(location) {
    // "d", "ㅇ" 같은 한 글자 위치는 검색해봐야 엉뚱한 장소가 잡힌다 — 건너뛴다.
    if (location.trim().length < 2) return null;

    let found = null;
    try {
      for (const query of geocodeCandidates(location)) {
        const results = await searchPlacesFn(query);
        found = results[0] ?? null;
        if (found?.lat != null) break;
      }
    } catch (error) {
      // 검색 API 미설정이면 기록하지 않는다 — 설정된 뒤 자연스럽게 재시도되도록.
      if (error.code === 'PLACES_NOT_CONFIGURED') return null;
      // 그 외 실패(네트워크 등)는 null 좌표로 기록해 재시도 폭주를 막는다.
    }

    return queries.upsertCafePlace({
      location,
      placeName: found?.placeName ?? null,
      roadAddress: found?.roadAddress ?? null,
      lat: found?.lat ?? null,
      lng: found?.lng ?? null,
    });
  }

  async function resolvePhotoUrl(photoUrl) {
    if (!photoUrl) return null;
    if (/^https?:\/\//.test(photoUrl)) return photoUrl;

    try {
      return await storage.createDownloadUrl(photoUrl);
    } catch {
      return null;
    }
  }
}
