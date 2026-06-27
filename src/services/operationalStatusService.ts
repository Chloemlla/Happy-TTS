import crypto from "node:crypto";
import { config } from "../config/config";

export interface ServerStatusSnapshot {
  boot_time: string;
  uptime: number;
  cpu_usage_percent: number;
  memory_usage: {
    used: number;
    total: number;
    percent: number;
  };
}

const MAX_SERVER_STATUS_PASSWORD_BYTES = 1024;

function timingSafeStringEqual(candidate: string, expected: string): boolean {
  const candidateLength = Buffer.byteLength(candidate, "utf8");
  const expectedLength = Buffer.byteLength(expected, "utf8");

  if (candidateLength > MAX_SERVER_STATUS_PASSWORD_BYTES) {
    return false;
  }

  const compareLength = Math.max(candidateLength, expectedLength);
  const candidateBuffer = Buffer.alloc(compareLength);
  const expectedBuffer = Buffer.alloc(compareLength);

  Buffer.from(candidate, "utf8").copy(candidateBuffer);
  Buffer.from(expected, "utf8").copy(expectedBuffer);

  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer) && candidateLength === expectedLength;
}

export function isServerStatusPasswordValid(candidate: unknown): boolean {
  if (typeof candidate !== "string") {
    return false;
  }

  return timingSafeStringEqual(candidate, config.serverStatusPassword);
}

export function getServerStatusSnapshot(): ServerStatusSnapshot {
  const bootTime = process.uptime();
  const memoryUsage = process.memoryUsage();

  return {
    boot_time: new Date(Date.now() - bootTime * 1000).toISOString(),
    uptime: bootTime,
    cpu_usage_percent: process.cpuUsage().user / 1000000,
    memory_usage: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      percent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
    },
  };
}
