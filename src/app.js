import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFeatures } from './core/loadFeatures.js';
import { ok } from './shared/api-response.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, '../client/dist');

export async function createApp(ctx) {
  const app = express();
  const hasClientBuild = ctx.config?.env !== 'test' && existsSync(clientDistPath);

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // 요청당 1회 토큰(또는 dev 폴백)을 해석해 req.user / req.userId 를 세팅한다.
  if (ctx.auth?.resolveUser) {
    app.use(ctx.auth.resolveUser);
  }

  if (hasClientBuild) {
    app.use(express.static(clientDistPath));
  }

  app.get('/api/status', (_req, res) => {
    res.json(ok({
      name: 'cafestudy API',
      status: 'ok',
      endpoints: {
        health: '/health',
        meetups: '/api/meetups',
      },
    }));
  });

  app.get('/api/storage/status', (_req, res) => {
    res.json(ok(ctx.storage?.status?.() ?? {
      configured: false,
      bucket: false,
      endpoint: false,
      region: false,
      accessKeyId: false,
      secretAccessKey: false,
      publicBaseUrl: false,
    }));
  });

  app.get('/health', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });

  await loadFeatures(app, ctx);

  if (hasClientBuild) {
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
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
  }

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
