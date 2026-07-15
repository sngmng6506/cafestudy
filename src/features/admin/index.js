import { createAdminRouter } from './admin.routes.js';

export default {
  name: 'admin',
  basePath: '/api/admin',
  createRoutes: (ctx) => createAdminRouter(ctx),
};
