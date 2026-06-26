const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

const logLevel = process.env.LOG_LEVEL || 'info';

const pinoConfig = {
  level: logLevel,
  base: { service: 'indexer', pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
};

let logger;

if (process.env.NODE_ENV === 'development') {
  const pinoPretty = require('pino-pretty');
  logger = pino(pinoConfig, pinoPretty());
} else {
  logger = pino(pinoConfig);
}

function createCorrelatedLogger() {
  const correlationId = uuidv4();
  return logger.child({ correlationId });
}

module.exports = {
  logger,
  createCorrelatedLogger,
};
