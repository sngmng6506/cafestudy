import { createTemplateRouter } from './template.routes.js';

export default {
  name: 'template',
  basePath: '/api/template',
  createRoutes: (ctx) => createTemplateRouter(ctx),
};
