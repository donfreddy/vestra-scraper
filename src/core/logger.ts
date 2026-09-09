import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LoggerOptions {
  level?: LogLevel;
  /** Préfixe affiché entre crochets, ex: le nom du scraper. */
  scope?: string;
}

/**
 * Logger minimal sans dépendance lourde. Écrit sur stderr pour ne pas polluer
 * un éventuel export JSON envoyé sur stdout.
 */
export class Logger {
  private readonly level: LogLevel;
  private readonly scope: string | undefined;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.scope = options.scope;
  }

  child(scope: string): Logger {
    const nextScope = this.scope ? `${this.scope}:${scope}` : scope;
    return new Logger({ level: this.level, scope: nextScope });
  }

  private write(level: Exclude<LogLevel, 'silent'>, color: (s: string) => string, args: unknown[]): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const tag = color(`[${level}]`);
    const scope = this.scope ? chalk.gray(`(${this.scope}) `) : '';
    // eslint-disable-next-line no-console
    console.error(tag, scope + formatArgs(args));
  }

  debug(...args: unknown[]): void {
    this.write('debug', chalk.gray, args);
  }
  info(...args: unknown[]): void {
    this.write('info', chalk.cyan, args);
  }
  warn(...args: unknown[]): void {
    this.write('warn', chalk.yellow, args);
  }
  error(...args: unknown[]): void {
    this.write('error', chalk.red, args);
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}
