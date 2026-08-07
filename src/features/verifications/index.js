import { createVerificationRouter } from './verification.routes.js';
import { registerVerificationUploadCleanup } from './verification.gc.js';

export default {
  name: 'verifications',
  basePath: '/api/verifications',
  createRoutes: (ctx) => createVerificationRouter(ctx),
  onLoad: (ctx) => registerVerificationUploadCleanup(ctx),
  navItem: { label: 'Verifications', path: '/verifications' },
};
