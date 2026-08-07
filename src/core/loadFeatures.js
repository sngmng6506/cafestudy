import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadFeatures(app, ctx) {
  const featuresDir = path.join(__dirname, '../features');
  const dirs = readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'));

  const features = [];
  for (const dir of dirs) {
    const indexPath = path.join(featuresDir, dir.name, 'index.js');
    const feature = (await import(pathToFileURL(indexPath).href)).default;
    validateFeatureContract(dir.name, feature);
    features.push(feature);
  }

  validateUniqueBasePaths(features);
  await registerFeatures(app, ctx, features);
}

export async function registerFeatures(app, ctx, features) {
  for (const feature of features) {
    const routes = feature.createRoutes(ctx);
    app.use(feature.basePath, routes);
    await feature.onLoad?.(ctx);
    console.log(`loaded feature: ${feature.name}`);
  }
}

export function validateUniqueBasePaths(features) {
  const owners = new Map();
  for (const feature of features) {
    const existing = owners.get(feature.basePath);
    if (existing) {
      throw new Error(
        `duplicate feature basePath "${feature.basePath}": ${existing} and ${feature.name}`,
      );
    }
    owners.set(feature.basePath, feature.name);
  }
}

export function validateFeatureContract(dirName, feature) {
  if (!feature || typeof feature !== 'object') {
    throw new Error(`[${dirName}] plugin contract violation: default export is required`);
  }
  if (!feature.name || typeof feature.name !== 'string') {
    throw new Error(`[${dirName}] plugin contract violation: name is required`);
  }
  if (!feature.basePath || typeof feature.basePath !== 'string') {
    throw new Error(`[${dirName}] plugin contract violation: basePath is required`);
  }
  if (typeof feature.createRoutes !== 'function') {
    throw new Error(`[${dirName}] plugin contract violation: createRoutes(ctx) is required`);
  }
  if (feature.onLoad != null && typeof feature.onLoad !== 'function') {
    throw new Error(`[${dirName}] plugin contract violation: onLoad must be a function`);
  }
}
