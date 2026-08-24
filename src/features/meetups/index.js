import { registerSomoimFailureListener, registerSomoimSuccessListener } from './meetup.hooks.js';
import { createMeetupRouter } from './meetup.routes.js';

export default {
  name: 'meetups',
  basePath: '/api/meetups',
  createRoutes: (ctx) => createMeetupRouter(ctx),
  onLoad: (ctx) => {
    registerSomoimFailureListener(ctx);
    registerSomoimSuccessListener(ctx);
  },
  navItem: { label: 'Meetups', path: '/meetups' },
};
