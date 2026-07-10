import { createGame2048Router } from './game2048.routes.js';

export default {
  name: 'game2048',
  basePath: '/api/game2048',
  createRoutes: (ctx) => createGame2048Router(ctx),
};
