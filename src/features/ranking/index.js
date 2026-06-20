import { createRankingRouter } from './ranking.routes.js';

export default {
  name: 'ranking',
  basePath: '/api/ranking',
  createRoutes: (ctx) => createRankingRouter(ctx),
  navItem: { label: 'Ranking', path: '/ranking' },
};
