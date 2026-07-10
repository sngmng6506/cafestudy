import { menuSearchMetadata } from './menu-search.metadata.js';

export function normalizeSearchText(value) {
  return (value ?? '')
    .toString()
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchMenusByKeyword(query, { metadata = menuSearchMetadata, limit = 3 } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  return metadata
    .map((item) => scoreMenu(item, normalizedQuery, queryTokens))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.featureName.localeCompare(b.featureName))
    .slice(0, limit);
}

function scoreMenu(item, normalizedQuery, queryTokens) {
  const candidates = [
    { type: 'description', text: item.description, weight: 1 },
    ...item.searchTerms.map((text) => ({ type: 'term', text, weight: 1.4 })),
    ...item.examples.map((text) => ({ type: 'example', text, weight: 1.1 })),
  ];

  let bestMatch = null;
  let score = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSearchText(candidate.text);
    if (!normalizedCandidate) continue;

    let candidateScore = 0;
    if (normalizedCandidate === normalizedQuery) {
      candidateScore = 1;
    } else if (
      normalizedCandidate.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedCandidate)
    ) {
      candidateScore = 0.85;
    } else {
      const candidateTokens = new Set(normalizedCandidate.split(' ').filter(Boolean));
      const matchedTokens = queryTokens.filter((token) =>
        [...candidateTokens].some((candidateToken) =>
          candidateToken.includes(token) || token.includes(candidateToken),
        ),
      );
      candidateScore = matchedTokens.length / Math.max(queryTokens.length, candidateTokens.size);
    }

    const weightedScore = candidateScore * candidate.weight;
    if (weightedScore > score) {
      score = weightedScore;
      bestMatch = candidate.text;
    }
  }

  return {
    featureName: item.featureName,
    score: Math.min(score, 1),
    matchedText: bestMatch,
  };
}
