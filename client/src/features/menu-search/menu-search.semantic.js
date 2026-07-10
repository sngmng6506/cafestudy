import { buildMenuSearchEntries, menuSearchMetadata } from './menu-search.metadata.js';
import { normalizeSearchText } from './menu-search.keyword.js';

let defaultEnginePromise;
let defaultIndexPromise;

export async function searchMenusBySemantic(
  query,
  {
    metadata = menuSearchMetadata,
    limit = 3,
    loadEngine = loadTernlightEngine,
    indexPromise,
  } = {},
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const engine = await loadEngine();
  const index = indexPromise
    ? await indexPromise
    : await getOrCreateIndex({ metadata, engine, useDefaultCache: metadata === menuSearchMetadata && loadEngine === loadTernlightEngine });
  const queryVector = engine.embed(normalizedQuery);
  const bestByFeature = new Map();

  for (const entry of index) {
    const score = engine.cosineSim(queryVector, entry.vector);
    const current = bestByFeature.get(entry.featureName);
    if (!current || score > current.score) {
      bestByFeature.set(entry.featureName, {
        featureName: entry.featureName,
        score,
        matchedText: entry.text,
      });
    }
  }

  return [...bestByFeature.values()]
    .sort((a, b) => b.score - a.score || a.featureName.localeCompare(b.featureName))
    .slice(0, limit);
}

export async function createSemanticMenuIndex({ metadata = menuSearchMetadata, loadEngine = loadTernlightEngine } = {}) {
  const engine = await loadEngine();
  return buildMenuSearchEntries(metadata).map((entry) => ({
    ...entry,
    vector: engine.embed(entry.text),
  }));
}

export function resetSemanticMenuSearchCache() {
  defaultEnginePromise = undefined;
  defaultIndexPromise = undefined;
}

async function getOrCreateIndex({ metadata, engine, useDefaultCache }) {
  if (!useDefaultCache) {
    return buildMenuSearchEntries(metadata).map((entry) => ({
      ...entry,
      vector: engine.embed(entry.text),
    }));
  }

  if (!defaultIndexPromise) {
    defaultIndexPromise = Promise.resolve(
      buildMenuSearchEntries(metadata).map((entry) => ({
        ...entry,
        vector: engine.embed(entry.text),
      })),
    );
  }
  return defaultIndexPromise;
}

async function loadTernlightEngine() {
  if (!defaultEnginePromise) {
    defaultEnginePromise = import('@ternlight/mini').then(({ embed, cosineSim }) => ({ embed, cosineSim }));
  }
  return defaultEnginePromise;
}
