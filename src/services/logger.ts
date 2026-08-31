import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { compileTimeConfig } from "../config/config";

function currentLogFileName(): string {
  return `${new Date().toISOString().split("T")[0]}.log`;
}

export class Logger {
  private logStream: NodeJS.WritableStream;
  private logDir: string;
  private currentLogDate = "";

  constructor() {
    // For pkg executables, use absolute path relative to executable location
    // For development, use relative path as before
    let logDir: string;

    if ((process as any).pkg) {
      // Running as pkg executable - use directory next to executable
      logDir = join(process.cwd(), "logs");
    } else {
      // Running in development - use config path
      logDir = compileTimeConfig.logsDir;
    }

    this.logDir = logDir;
    this.currentLogDate = currentLogFileName();

    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logFile = join(logDir, this.currentLogDate);
      this.logStream = createWriteStream(logFile, { flags: "a" });
      // G5-33: 写流错误处理——磁盘满/目录被删/权限变更时降级到控制台，避免 uncaughtException 拖垮进程。
      this.logStream.on("error", (err) => {
        console.warn("日志文件写入流错误，降级到控制台输出:", err);
        this.logStream = process.stdout;
      });
    } catch (error) {
      // If we can't create log files, fall back to console logging
      console.warn("无法创建日志文件，回退到控制台日志输出:", error);
      this.logStream = process.stdout;
    }
  }

  private ensureStreamForToday(): void {
    const today = currentLogFileName();
    if (today === this.currentLogDate) return;

    this.currentLogDate = today;
    // G5-33: 跨天切换日志文件句柄，避免所有日期都写进启动那天的文件。
    if (this.logStream && typeof (this.logStream as any).end === "function" && this.logStream !== process.stdout) {
      try {
        (this.logStream as NodeJS.WritableStream).end();
      } catch {
        // ignore close errors
      }
    }
    try {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      const logFile = join(this.logDir, today);
      const newStream = createWriteStream(logFile, { flags: "a" });
      newStream.on("error", (err) => {
        console.warn("日志文件写入流错误，降级到控制台输出:", err);
        this.logStream = process.stdout;
      });
      this.logStream = newStream;
    } catch (error) {
      console.warn("切换日志文件失败，回退到控制台输出:", error);
      this.logStream = process.stdout;
    }
  }

  log(message: string, data?: any) {
    this.ensureStreamForToday();
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      message,
      data,
    };

    // G5-33: JSON.stringify 遇循环引用会抛错；这里兜底避免把异常抛给业务调用方。
    let line: string;
    try {
      line = `${JSON.stringify(logEntry)}\n`;
    } catch {
      line = `${JSON.stringify({ timestamp, message, data: "[Unserializable data]" })}\n`;
    }
    this.logStream.write(line);
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
