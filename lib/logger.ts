/**
 * Structured Logger — lightweight structured logging for production observability.
 *
 * Features:
 * - JSON-structured output in production, readable in dev
 * - Log levels: debug, info, warn, error
 * - Contextual fields (userId, module, traceId)
 * - Ring-buffer for recent logs (exportable for error reports)
 * - Forward de errores a Sentry (Roadmap REMEDIATION-008)
 */

// Lazy import de Sentry para no bloquear el bundle principal.
// captureError es no-op si Sentry no está inicializado.
let _sentryCapture: ((err: unknown, ctx?: Record<string, unknown>) => void) | null = null;

/**
 * Registra el handler de Sentry en el logger global.
 * Llamar desde sentryInit.ts después de Sentry.init().
 */
export function registerSentryForwarder(
  handler: (err: unknown, ctx?: Record<string, unknown>) => void,
): void {
  _sentryCapture = handler;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  module?: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const RING_BUFFER_SIZE = 200;

class StructuredLogger {
  private minLevel: LogLevel = 'info';
  private context: Record<string, unknown> = {};
  private ringBuffer: LogEntry[] = [];
  private isProduction: boolean;

  constructor() {
    this.isProduction =
      typeof import.meta !== 'undefined' &&
      (import.meta as any).env?.MODE === 'production';
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  setContext(ctx: Record<string, unknown>): void {
    Object.assign(this.context, ctx);
  }

  child(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...this.context,
      ...fields,
    };

    this.pushToRing(entry);

    if (this.isProduction) {
      const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleFn(JSON.stringify(entry));
    } else {
      const prefix = `[${level.toUpperCase()}]`;
      const moduleName = entry.module ? ` (${entry.module})` : '';
      const extra = fields ? ` ${JSON.stringify(fields)}` : '';
      const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log;
      consoleFn(`${prefix}${moduleName} ${msg}${extra}`);
    }
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.log('debug', msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.log('info', msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.log('warn', msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.log('error', msg, fields);

    // Forward a Sentry si está disponible (Roadmap REMEDIATION-008)
    if (_sentryCapture) {
      const errorObj = fields?.error instanceof Error
        ? fields.error
        : new Error(msg);
      _sentryCapture(errorObj, fields);
    }
  }

  /** Export the ring buffer for error reports / diagnostics */
  getRecentLogs(): ReadonlyArray<LogEntry> {
    return [...this.ringBuffer];
  }

  /** Clear ring buffer */
  flush(): void {
    this.ringBuffer = [];
  }

  private pushToRing(entry: LogEntry): void {
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > RING_BUFFER_SIZE) {
      this.ringBuffer.shift();
    }
  }
}

class ModuleLogger {
  constructor(private parent: StructuredLogger, private module: string) {}

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.parent.log('debug', msg, { ...fields, module: this.module });
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    this.parent.log('info', msg, { ...fields, module: this.module });
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.parent.log('warn', msg, { ...fields, module: this.module });
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.parent.log('error', msg, { ...fields, module: this.module });
  }
}

/** Singleton logger instance */
export const logger = new StructuredLogger();
