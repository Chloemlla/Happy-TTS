import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import config from '../config';

export class Logger {
  private logStream: NodeJS.WritableStream;

  constructor() {
    const logDir = config.paths.logs;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const logFile = join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
    this.logStream = createWriteStream(logFile, { flags: 'a' });
  }

  log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      message,
      data,
    };

    this.logStream.write(JSON.stringify(logEntry) + '\n');
  }

  error(message: string, error?: any) {
    this.log(message, { error: error?.message || error });
  }

  close() {
    this.logStream.end();
  }
}

export const logger = new Logger(); 