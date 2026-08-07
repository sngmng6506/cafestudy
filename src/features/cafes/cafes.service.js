import { createCafesQueries } from './cafes.queries.js';
import { throwValidation, throwForbidden } from '../../shared/errors.js';
import { searchPlaces } from '../../shared/naver-local.js';

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

export function createCafesService({ db, storage, config = {}, searchPlacesFn }) {
  const queries = createCafesQueries(db);
  const placeSearch = searchPlacesFn ?? ((query) => searchPlaces(query, config.naver ?? {}));

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
      return [...cafes.values()].sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
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
    });
  }

  async function resolvePhotoUrl(photoUrl) {
    if (!photoUrl || /^https?:\/\//i.test(photoUrl)) return null;
    try { return await storage?.createDownloadUrl(photoUrl); }
    catch { return null; }
  }
}
