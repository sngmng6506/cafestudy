import { createMeetupRouter } from './meetup.routes.js';

export default {
  name: 'meetups',
  basePath: '/api/meetups',
  createRoutes: (ctx) => createMeetupRouter(ctx),
  navItem: { label: 'Meetups', path: '/meetups' },
};
