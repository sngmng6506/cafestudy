import { createSomoimAutomationRouter } from './somoim-automation.routes.js';

export default {
  name: 'somoim-automation',
  basePath: '/api/somoim-automation',
  createRoutes: (ctx) => createSomoimAutomationRouter(ctx),
};
