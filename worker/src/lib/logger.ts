/**
 * CF Workers 兼容的日志模块
 * 替代 winston / fs 写文件日志
 */
export class Logger {
  private prefix: string;

  constructor(prefix = 'happy-tts') {
    this.prefix = prefix;
  }

  private fmt(level: string, message: string, meta?: any): string {
    const ts = new Date().toISOString();
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    return `[${ts}] [${level}] [${this.prefix}] ${message}${metaStr}`;
  }

  info(message: string, meta?: any) {
    console.log(this.fmt('INFO', message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.fmt('WARN', message, meta));
  }

  error(message: string, meta?: any) {
    console.error(this.fmt('ERROR', message, meta));
  }

  debug(message: string, meta?: any) {
    console.debug(this.fmt('DEBUG', message, meta));
  }
}

export const logger = new Logger();
export default logger;
