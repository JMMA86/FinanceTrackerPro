/**
 * Structured Logger (Pino)
 * Production: JSON for log aggregators
 * Development: Pretty-printed for readability
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});

/**
 * Log levels:
 * - fatal: Application crash
 * - error: Errors that need attention
 * - warn: Warnings (recoverable issues)
 * - info: Important events
 * - debug: Detailed debugging
 * - trace: Very detailed debugging
 */

// Typed convenience methods
export const log = {
  fatal: (obj: object | string, msg?: string) => {
    if (typeof obj === 'string') {
      logger.fatal(obj);
    } else {
      logger.fatal(obj, msg);
    }
  },
  error: (obj: object | string, msg?: string) => {
    if (typeof obj === 'string') {
      logger.error(obj);
    } else {
      logger.error(obj, msg);
    }
  },
  warn: (obj: object | string, msg?: string) => {
    if (typeof obj === 'string') {
      logger.warn(obj);
    } else {
      logger.warn(obj, msg);
    }
  },
  info: (obj: object | string, msg?: string) => {
    if (typeof obj === 'string') {
      logger.info(obj);
    } else {
      logger.info(obj, msg);
    }
  },
  debug: (obj: object | string, msg?: string) => {
    if (typeof obj === 'string') {
      logger.debug(obj);
    } else {
      logger.debug(obj, msg);
    }
  },
  trace: (obj: object | string, msg?: string) => {
    if (typeof obj === 'string') {
      logger.trace(obj);
    } else {
      logger.trace(obj, msg);
    }
  },
};

export default logger;
