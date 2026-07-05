import { createSmashRouter } from './smash.routes.js';

export default {
  name: 'smash',
  basePath: '/api/smash',
  createRoutes: (ctx) => createSmashRouter(ctx),
};
