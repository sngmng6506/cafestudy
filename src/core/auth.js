import { fail } from '../shared/api-response.js';

export function createAuth({ env }) {
  return {
    requireUser(req, res, next) {
      const userId = req.header('x-user-id');

      if (env !== 'production' && userId) {
        req.user = { id: userId };
        return next();
      }

      return res.status(401).json(fail('UNAUTHENTICATED', 'Authentication is required'));
    },
  };
}
