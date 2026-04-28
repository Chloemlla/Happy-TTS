import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import logger from "../utils/logger";

export interface RequestProfileSample {
  requestId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  contentLength?: number;
  timestamp: string;
}

interface RouteProfileAggregate {
  method: string;
  path: string;
  count: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  lastMs: number;
  status4xx: number;
  status5xx: number;
  lastSeenAt: string;
}

interface ProcessMetricsSnapshot {
  sampledAt: string;
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  uptimeSec: number;
  cpuUserMsDelta: number;
  cpuSystemMsDelta: number;
  cpuPercent: number;
  eventLoopUtilizationPercent: number;
}

const mb = (value: number) => Math.round((value / 1024 / 1024) * 100) / 100;
const nsToMs = (value: number) => Math.round((value / 1_000_000) * 100) / 100;

class ProfilingService {
  private readonly enabled = process.env.PROFILING_ENABLED === "true";
  private readonly slowRequestThresholdMs = Number(process.env.PROFILING_SLOW_REQUEST_THRESHOLD_MS || 800);
  private readonly sampleLimit = Number(process.env.PROFILING_REQUEST_SAMPLE_LIMIT || 200);
  private readonly routeLimit = Number(process.env.PROFILING_ROUTE_LIMIT || 50);
  private readonly processSampleIntervalMs = Number(process.env.PROFILING_SAMPLE_INTERVAL_MS || 10_000);
  private readonly summaryLogIntervalMs = Number(process.env.PROFILING_SUMMARY_LOG_INTERVAL_MS || 0);
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private readonly recentRequests: RequestProfileSample[] = [];
  private readonly routeAggregates = new Map<string, RouteProfileAggregate>();
  private processMetrics: ProcessMetricsSnapshot | null = null;
  private processSampler: NodeJS.Timeout | null = null;
  private summaryLogger: NodeJS.Timeout | null = null;
  private started = false;
  private lastCpuUsage = process.cpuUsage();
  private lastCpuSampleNs = process.hrtime.bigint();
  private lastEventLoopUtilization = performance.eventLoopUtilization();

  start(): void {
    if (!this.enabled || this.started) {
      return;
    }

    this.started = true;
    this.histogram.enable();
    this.sampleProcessMetrics();

    this.processSampler = setInterval(() => {
      this.sampleProcessMetrics();
    }, this.processSampleIntervalMs);
    this.processSampler.unref();

    if (this.summaryLogIntervalMs > 0) {
      this.summaryLogger = setInterval(() => {
        const snapshot = this.getSnapshot();
        logger.info("[Profiling] Periodic summary", {
          process: snapshot.process,
          eventLoop: snapshot.eventLoop,
          hottestRoutes: snapshot.topRoutes.slice(0, 5),
        });
      }, this.summaryLogIntervalMs);
      this.summaryLogger.unref();
    }

    logger.info("[Profiling] Enabled", {
      slowRequestThresholdMs: this.slowRequestThresholdMs,
      sampleLimit: this.sampleLimit,
      routeLimit: this.routeLimit,
      processSampleIntervalMs: this.processSampleIntervalMs,
      summaryLogIntervalMs: this.summaryLogIntervalMs,
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  recordRequest(sample: RequestProfileSample): void {
    if (!this.enabled) {
      return;
    }

    this.recentRequests.push(sample);
    if (this.recentRequests.length > this.sampleLimit) {
      this.recentRequests.shift();
    }

    const routeKey = `${sample.method} ${sample.path}`;
    const existing = this.routeAggregates.get(routeKey);
    if (existing) {
      existing.count += 1;
      existing.lastMs = sample.durationMs;
      existing.maxMs = Math.max(existing.maxMs, sample.durationMs);
      existing.minMs = Math.min(existing.minMs, sample.durationMs);
      existing.avgMs = Math.round((((existing.avgMs * (existing.count - 1)) + sample.durationMs) / existing.count) * 100) / 100;
      existing.lastSeenAt = sample.timestamp;
      if (sample.statusCode >= 500) existing.status5xx += 1;
      else if (sample.statusCode >= 400) existing.status4xx += 1;
    } else {
      if (this.routeAggregates.size >= this.routeLimit) {
        const oldest = this.routeAggregates.entries().next().value as [string, RouteProfileAggregate] | undefined;
        if (oldest) {
          this.routeAggregates.delete(oldest[0]);
        }
      }
      this.routeAggregates.set(routeKey, {
        method: sample.method,
        path: sample.path,
        count: 1,
        avgMs: sample.durationMs,
        maxMs: sample.durationMs,
        minMs: sample.durationMs,
        lastMs: sample.durationMs,
        status4xx: sample.statusCode >= 400 && sample.statusCode < 500 ? 1 : 0,
        status5xx: sample.statusCode >= 500 ? 1 : 0,
        lastSeenAt: sample.timestamp,
      });
    }

    if (sample.durationMs >= this.slowRequestThresholdMs) {
      logger.warn("[Profiling] Slow request detected", sample);
    }
  }

  getSnapshot() {
    if (!this.enabled) {
      return {
        enabled: false,
        process: null,
        eventLoop: null,
        topRoutes: [],
        recentRequests: [],
        config: {
          slowRequestThresholdMs: this.slowRequestThresholdMs,
          processSampleIntervalMs: this.processSampleIntervalMs,
          requestSampleLimit: this.sampleLimit,
        },
      };
    }

    if (!this.processMetrics) {
      this.sampleProcessMetrics();
    }

    return {
      enabled: this.enabled,
      process: this.processMetrics,
      eventLoop: {
        minMs: nsToMs(this.histogram.min),
        maxMs: nsToMs(this.histogram.max),
        meanMs: nsToMs(this.histogram.mean),
        stddevMs: nsToMs(this.histogram.stddev),
        p50Ms: nsToMs(this.histogram.percentile(50)),
        p95Ms: nsToMs(this.histogram.percentile(95)),
        p99Ms: nsToMs(this.histogram.percentile(99)),
      },
      topRoutes: Array.from(this.routeAggregates.values()).sort((a, b) => b.avgMs - a.avgMs),
      recentRequests: [...this.recentRequests].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20),
      config: {
        slowRequestThresholdMs: this.slowRequestThresholdMs,
        processSampleIntervalMs: this.processSampleIntervalMs,
        requestSampleLimit: this.sampleLimit,
      },
    };
  }

  private sampleProcessMetrics(): void {
    const nowNs = process.hrtime.bigint();
    const cpuUsage = process.cpuUsage();
    const elapsedMs = Number(nowNs - this.lastCpuSampleNs) / 1_000_000;
    const userDeltaUs = cpuUsage.user - this.lastCpuUsage.user;
    const systemDeltaUs = cpuUsage.system - this.lastCpuUsage.system;
    const cpuPercentRaw = elapsedMs > 0 ? ((userDeltaUs + systemDeltaUs) / 1000 / elapsedMs) * 100 : 0;
    const memory = process.memoryUsage();
    const elu = performance.eventLoopUtilization(this.lastEventLoopUtilization);

    this.processMetrics = {
      sampledAt: new Date().toISOString(),
      rssMb: mb(memory.rss),
      heapUsedMb: mb(memory.heapUsed),
      heapTotalMb: mb(memory.heapTotal),
      externalMb: mb(memory.external),
      arrayBuffersMb: mb(memory.arrayBuffers),
      uptimeSec: Math.round(process.uptime()),
      cpuUserMsDelta: Math.round((userDeltaUs / 1000) * 100) / 100,
      cpuSystemMsDelta: Math.round((systemDeltaUs / 1000) * 100) / 100,
      cpuPercent: Math.round(cpuPercentRaw * 100) / 100,
      eventLoopUtilizationPercent: Math.round(elu.utilization * 10_000) / 100,
    };

    this.lastCpuUsage = cpuUsage;
    this.lastCpuSampleNs = nowNs;
    this.lastEventLoopUtilization = performance.eventLoopUtilization();
  }
}

export const profilingService = new ProfilingService();
