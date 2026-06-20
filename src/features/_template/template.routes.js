import { Router } from 'express';
import { sendOk } from '../../shared/api-response.js';

export function createTemplateRouter(_ctx) {
  const router = Router();

  router.get('/', (_req, res) => {
    sendOk(res, { feature: 'template' });
  });

  return router;
}
