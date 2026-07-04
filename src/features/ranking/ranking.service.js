import { createRankingQueries } from './ranking.queries.js';
import { attachBadgeImageUrls } from '../../shared/badge-image.js';

// Monthly ranking uses the service timezone (Asia/Seoul) per DEVELOPMENT.md.
// KST is a fixed UTC+9 offset with no daylight saving, so a constant offset is safe.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export function createRankingService({ db, storage }) {
  const queries = createRankingQueries(db);

  return {
    async getAllTimeRanking() {
      return attachBadgeImageUrls(storage, await queries.getAllTimeRanking());
    },

    // `year` + `month` (1-12) select a specific month; omitted -> current month.
    async getMonthlyRanking({ year, month } = {}) {
      const range =
        Number.isInteger(year) && Number.isInteger(month)
          ? getMonthRange(year, month - 1)
          : getCurrentMonthRange();

      return attachBadgeImageUrls(storage, await queries.getMonthlyRanking(range));
    },
  };
}

// [start, end) UTC ISO instants for the given Asia/Seoul calendar month (month0: 0-11),
// suitable for comparing against `timestamptz` columns.
export function getMonthRange(year, month0) {
  const start = new Date(Date.UTC(year, month0, 1) - SEOUL_OFFSET_MS);
  const end = new Date(Date.UTC(year, month0 + 1, 1) - SEOUL_OFFSET_MS);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// The current Asia/Seoul calendar month. `now` is injectable for testing.
export function getCurrentMonthRange(now = new Date()) {
  const seoulNow = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return getMonthRange(seoulNow.getUTCFullYear(), seoulNow.getUTCMonth());
}
