import { createCafesRouter } from './cafes.routes.js';

export default {
  name: 'cafes',
  basePath: '/api/cafes',
  createRoutes: (ctx) => createCafesRouter(ctx),
};

