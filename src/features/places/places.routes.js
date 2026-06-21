import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';
import { searchPlaces } from './places.service.js';

export function createPlacesRouter() {
  const router = Router();

  router.get('/search', async (req, res, next) => {
    try {
      const query = (req.query.q ?? '').toString().trim();
      if (!query) {
        return sendOk(res, []);
      }

      const places = await searchPlaces(query);
      sendOk(res, places);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
