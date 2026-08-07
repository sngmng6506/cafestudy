export function createShutdownHandler({
  server,
  db,
  logger,
  timeoutMs = 10_000,
  exit = process.exit,
}) {
  let shuttingDown = false;

  return async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown_started', { signal });

    const forceTimer = setTimeout(() => {
      logger.error('shutdown_timed_out', { signal, timeoutMs });
      server.closeAllConnections?.();
      exit(1);
    }, timeoutMs);
    forceTimer.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await db.close();
      clearTimeout(forceTimer);
      logger.info('shutdown_completed', { signal });
      exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      logger.error('shutdown_failed', {
        signal,
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      });
      exit(1);
    }
  };
}
