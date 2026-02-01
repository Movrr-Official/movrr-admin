/**
 * Enhanced logging utility for production
 */

import { isProduction, NODE_ENV, NEXT_PUBLIC_APP_URL } from "./env";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  [key: string]: unknown;
}

interface LoggerConfig {
  service: string;
  environment: string;
  minLevel: LogLevel;
  prettyPrint: boolean;
  staticContext: LogContext;
}

class Logger {
  private config: LoggerConfig;

  constructor() {
    const env = NODE_ENV || "development";
    const prettyPrint = !isProduction;

    // In production, only log WARN and ERROR; in dev, log everything.
    this.config = {
      service: "movrr-admin",
      environment: env,
      minLevel: isProduction ? LogLevel.WARN : LogLevel.DEBUG,
      prettyPrint,
      staticContext: {
        appUrl: NEXT_PUBLIC_APP_URL,
      },
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.minLevel;
  }

  private formatMessage(
    level: string,
    message: string,
    context?: LogContext,
  ): string {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.service,
      environment: this.config.environment,
      ...this.config.staticContext,
      ...(context ? { context } : {}),
    };

    if (this.config.prettyPrint) {
      const contextStr = context ? ` ${JSON.stringify(context)}` : "";
      return `[${payload.timestamp}] [${payload.level}] ${payload.message}${contextStr}`;
    }

    return JSON.stringify(payload);
  }

  child(extraContext: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.config = {
      ...this.config,
      staticContext: {
        ...this.config.staticContext,
        ...extraContext,
      },
    };
    return childLogger;
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage("DEBUG", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage("INFO", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage("WARN", message, context));
    }
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext = {
        ...context,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      };
      console.error(this.formatMessage("ERROR", message, errorContext));

      // In production, send to error tracking service
      if (isProduction && error) {
        this.sendToErrorTracking(message, error, errorContext);
      }
    }
  }

  private sendToErrorTracking(
    _message: string,
    _error?: unknown,
    _context?: LogContext,
  ): void {
    // TODO: Integrate with error tracking service (Sentry, LogRocket, etc.)
    // Example:
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error, { extra: context });
    // }
  }
}

export const logger = new Logger();
