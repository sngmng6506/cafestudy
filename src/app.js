import express from 'express';
import cors from 'cors';
import { loadFeatures } from './core/loadFeatures.js';
import { ok } from './shared/api-response.js';

export async function createApp(ctx) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json(ok({
      name: 'cafestudy API',
      status: 'ok',
      endpoints: {
        health: '/health',
        meetups: '/api/meetups',
      },
    }));
  });

  app.get('/health', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });

  await loadFeatures(app, ctx);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.statusCode ?? 500).json({
      data: null,
      error: {
        code: err.code ?? 'INTERNAL_ERROR',
        message: err.message ?? 'Unexpected server error',
      },
    });
  });

  return app;
}
