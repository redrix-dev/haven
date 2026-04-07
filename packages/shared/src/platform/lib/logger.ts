type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const write = (level: LogLevel, scope: string, message: string, meta?: unknown) => {
  const prefix = `[${scope}] ${message}`;

  if (level === 'debug') {
    console.debug(prefix, meta);
    return;
  }

  if (level === 'info') {
    console.info(prefix, meta);
    return;
  }

  if (level === 'warn') {
    console.warn(prefix, meta);
    return;
  }

  console.error(prefix, meta);
};

export const createLogger = (scope: string) => ({
  debug: (message: string, meta?: unknown) => write('debug', scope, message, meta),
  info: (message: string, meta?: unknown) => write('info', scope, message, meta),
  warn: (message: string, meta?: unknown) => write('warn', scope, message, meta),
  error: (message: string, meta?: unknown) => write('error', scope, message, meta),
});
