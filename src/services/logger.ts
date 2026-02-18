import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import config from "../config";

export class Logger {
  private logStream: NodeJS.WritableStream;

  constructor() {
    // For pkg executables, use absolute path relative to executable location
    // For development, use relative path as before
    let logDir: string;

    if ((process as any).pkg) {
      // Running as pkg executable - use directory next to executable
      logDir = join(process.cwd(), "logs");
    } else {
      // Running in development - use config path
      logDir = config.paths.logs;
    }

    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logFile = join(logDir, `${new Date().toISOString().split("T")[0]}.log`);
      this.logStream = createWriteStream(logFile, { flags: "a" });
    } catch (error) {
      // If we can't create log files, fall back to console logging
      console.warn("无法创建日志文件，回退到控制台日志输出:", error);
      this.logStream = process.stdout;
    }
  }

  log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      message,
      data,
    };

    this.logStream.write(JSON.stringify(logEntry) + "\n");
  }

  error(message: string, error?: any) {
    this.log(message, { error: error?.message || error });
  }

  // 兼容常见的日志等级，内部仍写入统一结构
  info(message: string, data?: any) {
    this.log(message, data);
  }

  warn(message: string, data?: any) {
    this.log(message, data);
  }

  close() {
    this.logStream.end();
  }
}

export const logger = new Logger();
