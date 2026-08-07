import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createAuth } from './core/auth.js';
import { createDb } from './core/db.js';
import { createLogger } from './core/logger.js';
import { createShutdownHandler } from './core/shutdown.js';
import { createStorage } from './core/storage.js';

dotenv.config();

const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000),
};

const logger = createLogger();
const db = createDb({ connectionString: process.env.DATABASE_URL, logger });
const auth = createAuth({ env: config.env, db });
const storage = createStorage(process.env);
const app = await createApp({ db, auth, storage, config, logger });

const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.env });
});

const shutdown = createShutdownHandler({
  server,
  db,
  logger,
  timeoutMs: config.shutdownTimeoutMs,
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
