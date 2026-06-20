import { createRankingQueries } from './ranking.queries.js';

// Monthly ranking uses the service timezone (Asia/Seoul) per DEVELOPMENT.md.
// KST is a fixed UTC+9 offset with no daylight saving, so a constant offset is safe.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export function createRankingService({ db }) {
  const queries = createRankingQueries(db);

  return {
    getAllTimeRanking() {
      return queries.getAllTimeRanking();
    },

    getMonthlyRanking() {
      const { start, end } = getCurrentMonthRange();
      return queries.getMonthlyRanking({ start, end });
    },
  };
}

// Returns the [start, end) instants of the current Asia/Seoul calendar month,
// as UTC ISO strings suitable for comparing against `timestamptz` columns.
// `now` is injectable for testing.
export function getCurrentMonthRange(now = new Date()) {
  const seoulNow = new Date(now.getTime() + SEOUL_OFFSET_MS);
  const year = seoulNow.getUTCFullYear();
  const month = seoulNow.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1) - SEOUL_OFFSET_MS);
  const end = new Date(Date.UTC(year, month + 1, 1) - SEOUL_OFFSET_MS);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
