import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFeatures } from './core/loadFeatures.js';
import { ok } from './shared/api-response.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, '../client/dist');
const fallbackLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export async function createApp(ctx) {
  const app = express();
  const logger = ctx.logger ?? fallbackLogger;
  const hasClientBuild = ctx.config?.env !== 'test' && existsSync(clientDistPath);

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const suppliedRequestId = req.get('x-request-id');
    req.requestId = suppliedRequestId?.trim() || randomUUID();
    res.set('x-request-id', req.requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info('http_request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.userId ?? req.user?.id ?? null,
      });
    });

    next();
  });

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
        liveness: '/live',
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

  app.get('/live', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });

  app.get('/health', async (req, res) => {
    try {
      await ctx.db.query('SELECT 1');
      res.json(ok({ status: 'ok', database: 'ok' }));
    } catch (error) {
      logger.error('readiness_failed', {
        requestId: req.requestId,
        dependency: 'database',
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.code,
      });
      res.status(503).json({
        data: { status: 'unavailable', database: 'unavailable' },
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: '서비스 준비 상태를 확인할 수 없습니다.',
        },
      });
    }
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
          liveness: '/live',
          health: '/health',
          meetups: '/api/meetups',
        },
      }));
    });
  }

  app.use((err, req, res, _next) => {
    const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
    const isOperational = statusCode < 500;

    logger.error('request_failed', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.code,
      stack: err.stack,
    });

    res.status(statusCode).json({
      data: null,
      error: {
        code: isOperational ? (err.code ?? 'REQUEST_ERROR') : 'INTERNAL_ERROR',
        message: isOperational
          ? (err.message ?? '요청을 처리할 수 없습니다.')
          : '서버에서 오류가 발생했습니다.',
        requestId: req.requestId,
      },
    });
  });

  return app;
}
