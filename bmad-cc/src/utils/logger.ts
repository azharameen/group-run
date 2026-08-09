import pino from 'pino';

const logLevel = process.env.BMAD_CC_LOG_LEVEL || 'info';

/**
 * Logger instance using pino, outputting prettified logs in non-production environments.
 */
export const logger = pino({
  level: logLevel,
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});
