import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createAuth } from './core/auth.js';
import { createDb } from './core/db.js';
import { createLogger } from './core/logger.js';
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

let shuttingDown = false;

export async function gracefulShutdown({
  signal,
  serverInstance = server,
  database = db,
  timeoutMs = config.shutdownTimeoutMs,
  appLogger = logger,
  exit = process.exit,
}) {
  if (shuttingDown) return;
  shuttingDown = true;
  appLogger.info('shutdown_started', { signal });

  const forceTimer = setTimeout(() => {
    appLogger.error('shutdown_timed_out', { signal, timeoutMs });
    serverInstance.closeAllConnections?.();
    exit(1);
  }, timeoutMs);
  forceTimer.unref();

  try {
    await new Promise((resolve, reject) => {
      serverInstance.close((error) => (error ? reject(error) : resolve()));
    });
    await database.close();
    clearTimeout(forceTimer);
    appLogger.info('shutdown_completed', { signal });
    exit(0);
  } catch (error) {
    clearTimeout(forceTimer);
    appLogger.error('shutdown_failed', {
      signal,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    });
    exit(1);
  }
}

process.on('SIGTERM', () => {
  void gracefulShutdown({ signal: 'SIGTERM' });
});
process.on('SIGINT', () => {
  void gracefulShutdown({ signal: 'SIGINT' });
});
