import { createSettlementRouter } from './settlement.routes.js';

export default {
  name: 'settlements',
  basePath: '/api/settlements',
  createRoutes: (ctx) => createSettlementRouter(ctx),
};
