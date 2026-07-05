import { createSmashQueries } from './smash.queries.js';

const SMASH_KEY = 'smashed';

// '깨부수기'는 전역 상태다 — 한 명이 깨부수면 모든 사용자의 화면이 깨진다.
export function createSmashService({ db }) {
  const queries = createSmashQueries(db);

  return {
    async getState() {
      const flag = await queries.getFlag(SMASH_KEY);
      return {
        smashed: flag?.value ?? false,
        updatedByName: flag?.updatedByName ?? null,
        updatedAt: flag?.updatedAt ?? null,
      };
    },

    async toggle(userId) {
      const flag = await queries.toggleFlag({ key: SMASH_KEY, userId });
      return { smashed: flag.value, updatedAt: flag.updatedAt };
    },
  };
}
