import { fail } from '../shared/api-response.js';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export function createAuth({ env }) {
  return {
    requireUser(req, res, next) {
      const userId = req.header('x-user-id') || DEMO_USER_ID;

      if (userId === DEMO_USER_ID || (env !== 'production' && userId)) {
        req.user = { id: userId };
        return next();
      }

      return res.status(401).json(fail('UNAUTHENTICATED', 'Authentication is required'));
    },

    // Resolves the current user without rejecting — for public reads that still
    // want to personalize (e.g. "have I joined this meetup?").
    userId(req) {
      return req.header('x-user-id') || DEMO_USER_ID;
    },
  };
}
