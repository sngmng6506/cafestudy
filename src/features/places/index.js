import { createPlacesRouter } from './places.routes.js';

export default {
  name: 'places',
  basePath: '/api/places',
  createRoutes: (ctx) => createPlacesRouter(ctx),
};
