/**
 * Structured logger using Pino
 * Provides JSON logging in production and pretty-printed logs in development
 */

import pino, { type Logger as PinoLogger } from 'pino';
import { env } from '@/lib/config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Create Pino logger instance with appropriate configuration
 */
function createLogger(): PinoLogger {
  const isDevelopment = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';

  return pino({
    level: isTest ? 'silent' : env.LOG_LEVEL || 'info',

    // Production: JSON logs
    // Development: Pretty-printed logs with colors
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,

    // Base context included in all logs
    base: {
      env: env.NODE_ENV,
      service: 'swapper',
    },

    // Timestamp format
    timestamp: () => `,"time":"${new Date().toISOString()}"`,

    // Serialize errors properly
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },

    // Format log messages
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  });
}

/**
 * Logger wrapper class to maintain backward compatibility
 * and provide additional convenience methods
 */
class Logger {
  private pino: PinoLogger;

  constructor() {
    this.pino = createLogger();
  }

  /**
   * Log debug message with optional structured data
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    if (metadata) {
      this.pino.debug(metadata, message);
    } else {
      this.pino.debug(message);
    }
  }

  /**
   * Log info message with optional structured data
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    if (metadata) {
      this.pino.info(metadata, message);
    } else {
      this.pino.info(message);
    }
  }

  /**
   * Log warning message with optional structured data
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    if (metadata) {
      this.pino.warn(metadata, message);
    } else {
      this.pino.warn(message);
    }
  }

  /**
   * Log error message with optional structured data
   * Automatically serializes Error objects
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    if (error instanceof Error) {
      this.pino.error({ err: error }, message);
    } else if (error) {
      this.pino.error(error, message);
    } else {
      this.pino.error(message);
    }
  }

  /**
   * Create a child logger with additional context
   * Useful for adding request IDs, user IDs, etc.
   */
  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    childLogger.pino = this.pino.child(bindings);
    return childLogger;
  }

  /**
   * Enable logging (useful for debugging tests)
   */
  enable(): void {
    this.pino.level = env.LOG_LEVEL || 'info';
  }

  /**
   * Disable logging (useful for tests)
   */
  disable(): void {
    this.pino.level = 'silent';
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.pino.level = level;
  }

  /**
   * Get the underlying Pino logger instance
   * For advanced use cases
   */
  getPino(): PinoLogger {
    return this.pino;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for child loggers
export type { Logger };
