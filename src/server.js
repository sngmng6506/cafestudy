import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createAuth } from './core/auth.js';
import { createConfig } from './core/config.js';
import { createDb } from './core/db.js';
import { createHooks } from './core/hooks.js';
import { createLogger } from './core/logger.js';
import { createShutdownHandler } from './core/shutdown.js';
import { createStorage } from './core/storage.js';

dotenv.config();

const config = createConfig(process.env);
const logger = createLogger();
const db = createDb({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl,
  logger,
});
const auth = createAuth({ env: config.env, db, config: config.auth });
const storage = createStorage(config.storage);
const hooks = createHooks({ logger });
const app = await createApp({ db, auth, storage, config, logger, hooks });

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
