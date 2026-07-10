import { throwValidation } from '../../shared/errors.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';
import { createGame2048Queries } from './game2048.queries.js';

const RANKING_LIMIT = 50;
const MAX_SCORE = 10_000_000; // 상식적 상한(비정상 값 방어)

export function createGame2048Service(ctx) {
  const queries = createGame2048Queries(ctx.db);

  return {
    // 게임오버 시 점수 제출. 기존 최고보다 높을 때만 갱신되고, 갱신된 최고를 반환.
    async submitScore(userId, score) {
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        throwValidation('점수가 올바르지 않습니다');
      }
      const bestScore = await queries.upsertBest(userId, score);
      return { bestScore };
    },

    async getMyBest(userId) {
      const bestScore = await queries.getMyBest(userId);
      return { bestScore };
    },

    async getRanking() {
      const rows = await queries.getRanking(RANKING_LIMIT);
      const ranked = rows.map((row, index) => ({ rank: index + 1, ...row }));
      return attachBadgeImageUrls(ctx.storage, ranked);
    },
  };
}
