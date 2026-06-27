import { createMembersRouter } from './members.routes.js';

export default {
  name: 'members',
  basePath: '/api/members',
  createRoutes: (ctx) => createMembersRouter(ctx),
  onLoad: (_ctx) => {},
};
