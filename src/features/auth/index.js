import { createAuthRouter } from './auth.routes.js';

export default {
  name: 'auth',
  basePath: '/api/auth',
  createRoutes: (ctx) => createAuthRouter(ctx),
};
