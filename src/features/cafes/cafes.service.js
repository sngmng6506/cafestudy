import { createCafesQueries } from './cafes.queries.js';
import { throwValidation, throwForbidden } from '../../shared/errors.js';

export function createCafesService(db) {
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

      return [...cafes.values()].sort((a, b) => new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
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
}
