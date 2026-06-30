const SHUTDOWN_TIMEOUT_MS = 10000;

class GracefulShutdown {
  constructor(logger) {
    this.logger = logger;
    this.shuttingDown = false;
    this.inFlight = false;
  }

  register(pool, server) {
    const handleSignal = async (signal) => {
      this.logger.info({ signal }, 'Shutdown signal received');
      this.shuttingDown = true;

      const shutdownTimeout = setTimeout(() => {
        this.logger.error('Shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);

      while (this.inFlight) {
        await new Promise(r => setTimeout(r, 100));
      }

      if (pool) await pool.end().catch(() => {});
      if (server) await server.close().catch(() => {});

      clearTimeout(shutdownTimeout);
      this.logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));
  }

  isShuttingDown() {
    return this.shuttingDown;
  }

  markInFlight(value) {
    this.inFlight = value;
  }
}

module.exports = GracefulShutdown;
