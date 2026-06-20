import { createVerificationRouter } from './verification.routes.js';

export default {
  name: 'verifications',
  basePath: '/api/verifications',
  createRoutes: (ctx) => createVerificationRouter(ctx),
  navItem: { label: 'Verifications', path: '/verifications' },
};
