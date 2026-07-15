import { createNoticesRouter } from './notices.routes.js';

export default {
  name: 'notices',
  basePath: '/api/notices',
  createRoutes: (ctx) => createNoticesRouter(ctx),
};
