import { createDiceRouter } from './dice.routes.js';

export default {
  name: 'dice',
  basePath: '/api/dice',
  createRoutes: (ctx) => createDiceRouter(ctx),
};
