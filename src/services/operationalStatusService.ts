import crypto from "node:crypto";
import { startupConfig } from "../config/config";

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

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

export function isServerStatusPasswordValid(candidate: unknown): boolean {
  if (typeof candidate !== "string") {
    return false;
  }

  return crypto.timingSafeEqual(sha256(candidate), sha256(startupConfig.serverPassword));
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

