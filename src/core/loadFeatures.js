import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadFeatures(app, ctx) {
  const featuresDir = path.join(__dirname, '../features');
  const dirs = readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'));

  for (const dir of dirs) {
    const indexPath = path.join(featuresDir, dir.name, 'index.js');
    const feature = (await import(pathToFileURL(indexPath).href)).default;

    validateFeatureContract(dir.name, feature);

    const routes = feature.createRoutes(ctx);
    app.use(feature.basePath, routes);
    feature.onLoad?.(ctx);

    console.log(`loaded feature: ${feature.name}`);
  }
}

function validateFeatureContract(dirName, feature) {
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
}
