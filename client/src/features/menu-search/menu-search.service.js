import { menuSearchMetadata } from './menu-search.metadata.js';
import { searchMenusByKeyword } from './menu-search.keyword.js';
import { searchMenusBySemantic } from './menu-search.semantic.js';

const SEMANTIC_WEIGHT = 0.3;
const KEYWORD_WEIGHT = 0.7;

export async function searchMenus(
  query,
  {
    metadata = menuSearchMetadata,
    limit = 3,
    semanticSearch = searchMenusBySemantic,
    onSemanticError,
  } = {},
) {
  const keywordResults = searchMenusByKeyword(query, { metadata, limit: metadata.length });
  let semanticResults = [];
  let mode = 'hybrid';

  try {
    semanticResults = await semanticSearch(query, { metadata, limit: metadata.length });
  } catch (error) {
    mode = 'keyword';
    onSemanticError?.(error);
  }

  const keywordByFeature = new Map(keywordResults.map((item) => [item.featureName, item]));
  const semanticByFeature = new Map(semanticResults.map((item) => [item.featureName, item]));

  const results = metadata
    .map((item) => {
      const keyword = keywordByFeature.get(item.featureName);
      const semantic = semanticByFeature.get(item.featureName);
      const keywordScore = keyword?.score ?? 0;
      const semanticScore = normalizeSemanticScore(semantic?.score);

      return {
        featureName: item.featureName,
        score: mode === 'hybrid'
          ? semanticScore * SEMANTIC_WEIGHT + keywordScore * KEYWORD_WEIGHT
          : keywordScore,
        semanticScore,
        keywordScore,
        matchedText: keyword?.matchedText ?? semantic?.matchedText ?? null,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.keywordScore - a.keywordScore || a.featureName.localeCompare(b.featureName))
    .slice(0, limit);

  return { mode, results };
}

// cosine similarity의 음수 영역은 추천 점수에 기여하지 않도록 0~1로 제한한다.
function normalizeSemanticScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}
