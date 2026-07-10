import { throwValidation } from '../../shared/errors.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';
import { createGame2048Queries } from './game2048.queries.js';

const RANKING_LIMIT = 50;
const MAX_SCORE = 10_000_000; // 상식적 상한(비정상 값 방어)
const BOARD_LEN = 16;

// 클라이언트가 보낸 게임 상태가 정상 구조인지 검증한다.
// { board: (0 | {id, value})[16], score: int } 형태만 통과.
function isValidState(state) {
  if (!state || typeof state !== 'object') return false;
  if (!Number.isInteger(state.score) || state.score < 0 || state.score > MAX_SCORE) {
    return false;
  }
  if (!Array.isArray(state.board) || state.board.length !== BOARD_LEN) return false;
  return state.board.every((cell) => {
    if (cell === 0) return true;
    return (
      cell &&
      typeof cell === 'object' &&
      Number.isInteger(cell.id) &&
      Number.isInteger(cell.value) &&
      cell.value >= 2 &&
      cell.value <= MAX_SCORE
    );
  });
}

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

    // 진행 중인 게임 상태 저장. 클라이언트가 보낸 구조를 검증해 오염을 막는다.
    async saveState(userId, state) {
      if (!isValidState(state)) {
        throwValidation('게임 상태가 올바르지 않습니다');
      }
      await queries.saveState(userId, state);
      return { saved: true };
    },

    async loadState(userId) {
      const savedState = await queries.getState(userId);
      // 저장된 값도 한 번 검증(스키마 변경/구버전 대비). 이상하면 없는 것으로 처리.
      return { savedState: isValidState(savedState) ? savedState : null };
    },

    async clearState(userId) {
      await queries.clearState(userId);
      return { cleared: true };
    },

    async getRanking() {
      const rows = await queries.getRanking(RANKING_LIMIT);
      const ranked = rows.map((row, index) => ({ rank: index + 1, ...row }));
      return attachBadgeImageUrls(ctx.storage, ranked);
    },
  };
}
