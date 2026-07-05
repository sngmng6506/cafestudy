import { createSmashQueries } from './smash.queries.js';

const SMASH_KEY = 'smashed';

// '깨부수기'는 전역 상태다 — 한 명이 깨부수면 모든 사용자의 화면이 깨진다.
// 누가 조작했는지는 기록하지도, 노출하지도 않는다 (익명 파괴자 보장).
export function createSmashService({ db }) {
  const queries = createSmashQueries(db);

  return {
    async getState() {
      const flag = await queries.getFlag(SMASH_KEY);
      return {
        smashed: flag?.value ?? false,
        updatedAt: flag?.updatedAt ?? null,
      };
    },

    async toggle() {
      const flag = await queries.toggleFlag({ key: SMASH_KEY });
      return { smashed: flag.value, updatedAt: flag.updatedAt };
    },
  };
}
