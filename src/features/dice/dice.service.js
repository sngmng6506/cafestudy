import { createDiceQueries } from './dice.queries.js';

export function createDiceService({ db }) {
  const queries = createDiceQueries(db);

  return {
    async roll(userId) {
      const value = Math.floor(Math.random() * 6) + 1;
      await queries.awardPoints({ userId, amount: value });
      const totalPoints = await queries.getMyPoints(userId);
      return { value, earned: value, totalPoints };
    },

    getMyPoints(userId) {
      return queries.getMyPoints(userId);
    },

    getRanking() {
      return queries.getRanking();
    },
  };
}
