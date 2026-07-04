import { createBadgesRouter } from './badges.routes.js';

export default {
  name: 'badges',
  basePath: '/api/badges',
  createRoutes: (ctx) => createBadgesRouter(ctx),
};
