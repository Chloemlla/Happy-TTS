import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import axios, { type AxiosRequestConfig, type Method } from "axios";
import { config } from "../config/config";
import logger from "../utils/logger";
import { wsService } from "./wsService";

export type RustBenchmarkTarget =
  | "network-tools"
  | "audio-worker"
  | "file-worker"
  | "data-tools"
  | "security-worker";

export type RustBenchmarkOperation =
  | "health"
  | "network-dns"
  | "network-http-timing"
  | "file-hash"
  | "file-inspect"
  | "audio-passthrough"
  | "data-hash"
  | "data-json-inspect"
  | "security-risk-score"
  | "security-content-scan";

export type RustBenchmarkStatus = "idle" | "running" | "stopping" | "completed" | "failed";

export interface RustBenchmarkTargetInfo {
  id: RustBenchmarkTarget;
  label: string;
  defaultBaseUrl: string;
  configured: boolean;
  defaultOperation: RustBenchmarkOperation;
  operations: RustBenchmarkOperation[];
}

export interface RustBenchmarkStartOptions {
  target?: RustBenchmarkTarget;
  operation?: RustBenchmarkOperation;
  durationMs?: number;
  concurrency?: number;
  payloadBytes?: number;
  targetValue?: string;
  baseUrl?: string;
  internalToken?: string;
  timeoutMs?: number;
}

export interface RustBenchmarkSample {
  at: string;
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

export interface RustBenchmarkErrorSummary {
  message: string;
  count: number;
  lastAt: string;
}

export interface RustBenchmarkSnapshot {
  runId: string | null;
  status: RustBenchmarkStatus;
  target: RustBenchmarkTarget | null;
  operation: RustBenchmarkOperation | null;
  baseUrl?: string;
  startedAt?: string;
  endedAt?: string;
  elapsedMs: number;
  requested: {
    durationMs: number;
    concurrency: number;
    payloadBytes: number;
    targetValue?: string;
    timeoutMs: number;
  } | null;
  counters: {
    total: number;
    success: number;
    failed: number;
    inFlight: number;
  };
  rates: {
    requestsPerSecond: number;
    successRate: number;
  };
  latency: {
    lastMs: number | null;
    minMs: number | null;
    maxMs: number | null;
    avgMs: number | null;
    p50Ms: number | null;
    p90Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
  };
  errors: RustBenchmarkErrorSummary[];
  samples: RustBenchmarkSample[];
}

interface NormalizedBenchmarkRun {
  runId: string;
  target: RustBenchmarkTarget;
  operation: RustBenchmarkOperation;
  baseUrl: string;
  internalToken: string;
  durationMs: number;
  concurrency: number;
  payloadBytes: number;
  targetValue?: string;
  timeoutMs: number;
}

interface TargetDefinition {
  id: RustBenchmarkTarget;
  label: string;
  defaultBaseUrl: string;
  configured: boolean;
  defaultOperation: RustBenchmarkOperation;
  operations: RustBenchmarkOperation[];
  timeoutMs: number;
  token?: string;
}

interface OperationDefinition {
  target: RustBenchmarkTarget;
  method: Method;
  path: string;
  defaultTargetValue?: string;
  buildBody: (run: NormalizedBenchmarkRun, sequence: number) => unknown;
}

interface MutableRunState extends NormalizedBenchmarkRun {
  status: RustBenchmarkStatus;
  startedAt: number;
  endedAt?: number;
  counters: {
    total: number;
    success: number;
    failed: number;
    inFlight: number;
  };
  latency: {
    lastMs: number | null;
    minMs: number | null;
    maxMs: number | null;
    sumMs: number;
    values: number[];
  };
  errors: Map<string, { count: number; lastAt: number }>;
  samples: RustBenchmarkSample[];
  abortController: AbortController;
  emitTimer: ReturnType<typeof setInterval> | null;
}

const CHANNEL = "rust-benchmark";
const MAX_DURATION_MS = 5 * 60_000;
const MIN_DURATION_MS = 1_000;
const DEFAULT_DURATION_MS = 30_000;
const MAX_CONCURRENCY = 128;
const DEFAULT_CONCURRENCY = 8;
const MIN_PAYLOAD_BYTES = 16;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const DEFAULT_PAYLOAD_BYTES = 4096;
const MAX_LATENCY_VALUES = 50_000;
const MAX_SAMPLES = 80;
const MAX_ERRORS = 12;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const OPERATION_DEFINITIONS: Record<RustBenchmarkOperation, OperationDefinition> = {
  health: {
    target: "network-tools",
    method: "GET",
    path: "/healthz",
    buildBody: () => undefined,
  },
  "network-dns": {
    target: "network-tools",
    method: "POST",
    path: "/v1/network/dns",
    defaultTargetValue: "example.com",
    buildBody: (run) => ({
      address: run.targetValue || "example.com",
      recordTypes: ["A", "AAAA"],
      timeoutMs: Math.min(run.timeoutMs, 10_000),
    }),
  },
  "network-http-timing": {
    target: "network-tools",
    method: "POST",
    path: "/v1/network/http-timing",
    defaultTargetValue: "https://example.com",
    buildBody: (run) => ({
      url: run.targetValue || "https://example.com",
      method: "GET",
      timeoutMs: Math.min(run.timeoutMs, 15_000),
      maxBytes: Math.min(run.payloadBytes, 64 * 1024),
    }),
  },
  "file-hash": {
    target: "file-worker",
    method: "POST",
    path: "/v1/file/hash",
    buildBody: (run, sequence) => ({
      fileBase64: buildPayloadBuffer(run.payloadBytes, sequence).toString("base64"),
      algorithms: ["sha256", "sha512"],
    }),
  },
  "file-inspect": {
    target: "file-worker",
    method: "POST",
    path: "/v1/file/inspect",
    buildBody: (run, sequence) => ({
      fileBase64: buildPayloadBuffer(run.payloadBytes, sequence).toString("base64"),
      fileName: "benchmark.bin",
      declaredMime: "application/octet-stream",
    }),
  },
  "audio-passthrough": {
    target: "audio-worker",
    method: "POST",
    path: "/v1/audio/process",
    buildBody: (run, sequence) => ({
      audioBase64: buildWavPayload(run.payloadBytes, sequence).toString("base64"),
      outputFormat: "wav",
      taskId: `bench-${run.runId}-${sequence}`,
      contentHash: `${run.runId}-${sequence}`,
      operations: ["passthrough", "analyze"],
    }),
  },
  "data-hash": {
    target: "data-tools",
    method: "POST",
    path: "/v1/data/hash",
    buildBody: (run, sequence) => ({
      items: buildTextItems(run.payloadBytes, sequence),
      algorithm: "sha256",
    }),
  },
  "data-json-inspect": {
    target: "data-tools",
    method: "POST",
    path: "/v1/data/json/inspect",
    buildBody: (run, sequence) => ({
      text: JSON.stringify({
        runId: run.runId,
        sequence,
        payload: buildTextPayload(Math.max(16, run.payloadBytes - 64), sequence),
      }),
    }),
  },
  "security-risk-score": {
    target: "security-worker",
    method: "POST",
    path: "/v1/security/risk/score",
    buildBody: (_run, sequence) => ({
      signals: {
        tor: false,
        vpn: sequence % 7 === 0,
        failedLoginCount: sequence % 11,
        requestRatePerMinute: 60 + (sequence % 90),
        userAgent: "SynapseRustBenchmark/1.0",
        newDevice: sequence % 5 === 0,
        newLocation: sequence % 9 === 0,
      },
    }),
  },
  "security-content-scan": {
    target: "security-worker",
    method: "POST",
    path: "/v1/security/content/scan",
    buildBody: (run, sequence) => ({
      text: `benchmark-${sequence} ${buildTextPayload(run.payloadBytes, sequence)} token-alpha`,
      rules: [
        { id: "token-alpha", pattern: "token-alpha", severity: 2 },
        { id: "token-beta", pattern: "token-beta", severity: 5 },
      ],
      caseSensitive: false,
    }),
  },
};

export class RustBenchmarkService {
  private currentRun: MutableRunState | null = null;
  private lastSnapshot: RustBenchmarkSnapshot = this.emptySnapshot();

  getTargets(): RustBenchmarkTargetInfo[] {
    return this.getTargetDefinitions().map((target) => ({
      id: target.id,
      label: target.label,
      defaultBaseUrl: target.defaultBaseUrl,
      configured: target.configured,
      defaultOperation: target.defaultOperation,
      operations: target.operations,
    }));
  }

  getSnapshot(): RustBenchmarkSnapshot {
    if (this.currentRun) {
      return this.snapshot(this.currentRun);
    }
    return this.lastSnapshot;
  }

  async start(options: RustBenchmarkStartOptions = {}): Promise<RustBenchmarkSnapshot> {
    if (this.currentRun?.status === "running" || this.currentRun?.status === "stopping") {
      throw new Error("Rust benchmark is already running");
    }

    const normalized = this.normalizeOptions(options);
    const run: MutableRunState = {
      ...normalized,
      status: "running",
      startedAt: Date.now(),
      counters: {
        total: 0,
        success: 0,
        failed: 0,
        inFlight: 0,
      },
      latency: {
        lastMs: null,
        minMs: null,
        maxMs: null,
        sumMs: 0,
        values: [],
      },
      errors: new Map(),
      samples: [],
      abortController: new AbortController(),
      emitTimer: null,
    };

    this.currentRun = run;
    this.emit(run);
    run.emitTimer = setInterval(() => this.emit(run), 1000);
    if (run.emitTimer.unref) {
      run.emitTimer.unref();
    }

    logger.info("[RustBenchmark] started", {
      runId: run.runId,
      target: run.target,
      operation: run.operation,
      durationMs: run.durationMs,
      concurrency: run.concurrency,
      payloadBytes: run.payloadBytes,
      baseUrl: run.baseUrl,
    });

    void this.execute(run).catch((error) => {
      logger.error("[RustBenchmark] run failed", {
        runId: run.runId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.finish(run, "failed");
    });

    return this.snapshot(run);
  }

  stop(): RustBenchmarkSnapshot {
    if (!this.currentRun || this.currentRun.status !== "running") {
      return this.getSnapshot();
    }

    this.currentRun.status = "stopping";
    this.currentRun.abortController.abort();
    this.emit(this.currentRun);
    return this.snapshot(this.currentRun);
  }

  private async execute(run: MutableRunState): Promise<void> {
    const deadline = run.startedAt + run.durationMs;
    let sequence = 0;

    const workers = Array.from({ length: run.concurrency }, async () => {
      while (!run.abortController.signal.aborted && Date.now() < deadline) {
        const currentSequence = ++sequence;
        await this.executeOne(run, currentSequence);
      }
    });

    await Promise.all(workers);
    this.finish(run, run.status === "stopping" ? "completed" : "completed");
  }

  private async executeOne(run: MutableRunState, sequence: number): Promise<void> {
    const definition = this.getOperationDefinition(run.operation, run.target);
    const started = performance.now();
    run.counters.inFlight += 1;

    try {
      const response = await this.requestRust(run, definition, sequence);
      const latencyMs = performance.now() - started;
      this.recordSuccess(run, latencyMs, response.status);
    } catch (error) {
      const latencyMs = performance.now() - started;
      this.recordFailure(run, latencyMs, error);
    } finally {
      run.counters.inFlight -= 1;
    }
  }

  private async requestRust(
    run: MutableRunState,
    definition: OperationDefinition,
    sequence: number,
  ): Promise<{ status: number }> {
    const body = definition.buildBody(run, sequence);
    const requestConfig: AxiosRequestConfig = {
      method: definition.method,
      url: this.buildUrl(run.baseUrl, definition.path),
      timeout: run.timeoutMs,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Internal-Token": run.internalToken,
      },
      data: body,
      signal: run.abortController.signal,
      validateStatus: (status) => status >= 200 && status < 300,
    };

    const response = await axios.request(requestConfig);
    return { status: response.status };
  }

  private finish(run: MutableRunState, status: RustBenchmarkStatus): void {
    if (this.currentRun?.runId !== run.runId) {
      return;
    }

    run.status = status;
    run.endedAt = Date.now();

    if (run.emitTimer) {
      clearInterval(run.emitTimer);
      run.emitTimer = null;
    }

    const finalSnapshot = this.snapshot(run);
    this.lastSnapshot = finalSnapshot;
    this.currentRun = null;

    wsService.sendToChannel(CHANNEL, {
      type: "rust-benchmark:update",
      data: finalSnapshot,
    });

    logger.info("[RustBenchmark] finished", {
      runId: run.runId,
      status,
      total: run.counters.total,
      success: run.counters.success,
      failed: run.counters.failed,
      requestsPerSecond: finalSnapshot.rates.requestsPerSecond,
      p95Ms: finalSnapshot.latency.p95Ms,
    });
  }

  private emit(run: MutableRunState): void {
    wsService.sendToChannel(CHANNEL, {
      type: "rust-benchmark:update",
      data: this.snapshot(run),
    });
  }

  private normalizeOptions(options: RustBenchmarkStartOptions): NormalizedBenchmarkRun {
    const targets = this.getTargetDefinitions();
    const targetId = options.target || "network-tools";
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) {
      throw new Error(`Unsupported Rust benchmark target: ${String(targetId)}`);
    }

    const operation = options.operation || target.defaultOperation;
    this.getOperationDefinition(operation, target.id);

    const baseUrl = (options.baseUrl || target.defaultBaseUrl).trim();
    this.assertLoopbackBaseUrl(baseUrl);

    const internalToken = (options.internalToken || target.token || config.rustServices.internalToken || "").trim();
    if (!internalToken) {
      throw new Error("Rust benchmark requires an internal service token");
    }

    const operationDefinition = OPERATION_DEFINITIONS[operation];
    const targetValue = normalizeOptionalText(options.targetValue) || operationDefinition.defaultTargetValue;

    return {
      runId: randomUUID(),
      target: target.id,
      operation,
      baseUrl,
      internalToken,
      durationMs: clampInteger(options.durationMs, MIN_DURATION_MS, MAX_DURATION_MS, DEFAULT_DURATION_MS),
      concurrency: clampInteger(options.concurrency, 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY),
      payloadBytes: clampInteger(options.payloadBytes, MIN_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES, DEFAULT_PAYLOAD_BYTES),
      targetValue,
      timeoutMs: clampInteger(options.timeoutMs, 100, 60_000, target.timeoutMs),
    };
  }

  private getOperationDefinition(operation: RustBenchmarkOperation, target: RustBenchmarkTarget): OperationDefinition {
    const definition = OPERATION_DEFINITIONS[operation];
    if (!definition) {
      throw new Error(`Unsupported Rust benchmark operation: ${String(operation)}`);
    }

    if (operation !== "health" && definition.target !== target) {
      throw new Error(`Operation ${operation} cannot run against ${target}`);
    }

    return operation === "health"
      ? {
          ...definition,
          target,
        }
      : definition;
  }

  private getTargetDefinitions(): TargetDefinition[] {
    const token = config.rustServices.internalToken;
    return [
      {
        id: "network-tools",
        label: "Network Tools",
        defaultBaseUrl: config.rustServices.networkTools.url,
        configured: config.rustServices.networkTools.enabled,
        defaultOperation: "network-dns",
        operations: ["health", "network-dns", "network-http-timing"],
        timeoutMs: config.rustServices.networkTools.timeoutMs,
        token,
      },
      {
        id: "audio-worker",
        label: "Audio Worker",
        defaultBaseUrl: config.rustServices.audioWorker.url,
        configured: config.rustServices.audioWorker.enabled,
        defaultOperation: "audio-passthrough",
        operations: ["health", "audio-passthrough"],
        timeoutMs: config.rustServices.audioWorker.timeoutMs,
        token,
      },
      {
        id: "file-worker",
        label: "File Worker",
        defaultBaseUrl: config.rustServices.fileWorker.url,
        configured: config.rustServices.fileWorker.enabled,
        defaultOperation: "file-hash",
        operations: ["health", "file-hash", "file-inspect"],
        timeoutMs: config.rustServices.fileWorker.timeoutMs,
        token,
      },
      {
        id: "data-tools",
        label: "Data Tools",
        defaultBaseUrl: process.env.RUST_DATA_TOOLS_URL || "http://127.0.0.1:4040",
        configured: Boolean(process.env.RUST_DATA_TOOLS_URL),
        defaultOperation: "data-hash",
        operations: ["health", "data-hash", "data-json-inspect"],
        timeoutMs: Number(process.env.RUST_DATA_TOOLS_TIMEOUT_MS) || 30_000,
        token: process.env.RUST_DATA_TOOLS_INTERNAL_TOKEN || token,
      },
      {
        id: "security-worker",
        label: "Security Worker",
        defaultBaseUrl: process.env.RUST_SECURITY_WORKER_URL || "http://127.0.0.1:4050",
        configured: Boolean(process.env.RUST_SECURITY_WORKER_URL),
        defaultOperation: "security-risk-score",
        operations: ["health", "security-risk-score", "security-content-scan"],
        timeoutMs: Number(process.env.RUST_SECURITY_WORKER_TIMEOUT_MS) || 30_000,
        token: process.env.RUST_SECURITY_WORKER_INTERNAL_TOKEN || token,
      },
    ];
  }

  private recordSuccess(run: MutableRunState, latencyMs: number, statusCode?: number): void {
    run.counters.total += 1;
    run.counters.success += 1;
    this.recordLatency(run, latencyMs);
    this.pushSample(run, {
      at: new Date().toISOString(),
      ok: true,
      latencyMs: round(latencyMs),
      statusCode,
    });
  }

  private recordFailure(run: MutableRunState, latencyMs: number, error: unknown): void {
    if (isBenchmarkCancellation(run, error)) {
      return;
    }

    run.counters.total += 1;
    run.counters.failed += 1;
    this.recordLatency(run, latencyMs);

    const message = formatErrorMessage(error);
    const existing = run.errors.get(message);
    if (existing) {
      existing.count += 1;
      existing.lastAt = Date.now();
    } else {
      run.errors.set(message, { count: 1, lastAt: Date.now() });
    }

    this.pushSample(run, {
      at: new Date().toISOString(),
      ok: false,
      latencyMs: round(latencyMs),
      error: message,
    });
  }

  private recordLatency(run: MutableRunState, latencyMs: number): void {
    const value = round(latencyMs);
    run.latency.lastMs = value;
    run.latency.minMs = run.latency.minMs === null ? value : Math.min(run.latency.minMs, value);
    run.latency.maxMs = run.latency.maxMs === null ? value : Math.max(run.latency.maxMs, value);
    run.latency.sumMs += value;
    run.latency.values.push(value);
    if (run.latency.values.length > MAX_LATENCY_VALUES) {
      run.latency.values.splice(0, run.latency.values.length - MAX_LATENCY_VALUES);
    }
  }

  private pushSample(run: MutableRunState, sample: RustBenchmarkSample): void {
    run.samples.push(sample);
    if (run.samples.length > MAX_SAMPLES) {
      run.samples.splice(0, run.samples.length - MAX_SAMPLES);
    }
  }

  private snapshot(run: MutableRunState): RustBenchmarkSnapshot {
    const now = Date.now();
    const elapsedMs = Math.max(0, (run.endedAt || now) - run.startedAt);
    const total = run.counters.total;
    const successRate = total > 0 ? run.counters.success / total : 0;
    const values = [...run.latency.values].sort((left, right) => left - right);

    return {
      runId: run.runId,
      status: run.status,
      target: run.target,
      operation: run.operation,
      baseUrl: run.baseUrl,
      startedAt: new Date(run.startedAt).toISOString(),
      endedAt: run.endedAt ? new Date(run.endedAt).toISOString() : undefined,
      elapsedMs,
      requested: {
        durationMs: run.durationMs,
        concurrency: run.concurrency,
        payloadBytes: run.payloadBytes,
        targetValue: run.targetValue,
        timeoutMs: run.timeoutMs,
      },
      counters: { ...run.counters },
      rates: {
        requestsPerSecond: elapsedMs > 0 ? round((total / elapsedMs) * 1000) : 0,
        successRate: round(successRate * 100),
      },
      latency: {
        lastMs: run.latency.lastMs,
        minMs: run.latency.minMs,
        maxMs: run.latency.maxMs,
        avgMs: total > 0 ? round(run.latency.sumMs / total) : null,
        p50Ms: percentile(values, 0.5),
        p90Ms: percentile(values, 0.9),
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
      },
      errors: [...run.errors.entries()]
        .map(([message, value]) => ({
          message,
          count: value.count,
          lastAt: new Date(value.lastAt).toISOString(),
        }))
        .sort((left, right) => right.count - left.count)
        .slice(0, MAX_ERRORS),
      samples: [...run.samples].reverse(),
    };
  }

  private emptySnapshot(): RustBenchmarkSnapshot {
    return {
      runId: null,
      status: "idle",
      target: null,
      operation: null,
      elapsedMs: 0,
      requested: null,
      counters: {
        total: 0,
        success: 0,
        failed: 0,
        inFlight: 0,
      },
      rates: {
        requestsPerSecond: 0,
        successRate: 0,
      },
      latency: {
        lastMs: null,
        minMs: null,
        maxMs: null,
        avgMs: null,
        p50Ms: null,
        p90Ms: null,
        p95Ms: null,
        p99Ms: null,
      },
      errors: [],
      samples: [],
    };
  }

  private buildUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }

  private assertLoopbackBaseUrl(baseUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error("Rust benchmark baseUrl must be a valid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Rust benchmark baseUrl must use http or https");
    }

    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      throw new Error("Rust benchmark baseUrl must point to a loopback host");
    }
  }
}

function isBenchmarkCancellation(run: MutableRunState, error: unknown): boolean {
  if (!run.abortController.signal.aborted) {
    return false;
  }

  return axios.isCancel(error) || (axios.isAxiosError(error) && error.code === "ERR_CANCELED");
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function percentile(sortedValues: number[], quantile: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * quantile) - 1));
  return sortedValues[index] ?? null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPayloadBuffer(size: number, sequence: number): Buffer {
  const payload = Buffer.alloc(size);
  const seed = Buffer.from(`Synapse Rust benchmark ${sequence}\n`, "utf8");
  for (let index = 0; index < payload.length; index++) {
    payload[index] = seed[index % seed.length] ^ (index & 0xff);
  }
  return payload;
}

function buildWavPayload(size: number, sequence: number): Buffer {
  const normalizedSize = Math.max(44, size);
  const payload = buildPayloadBuffer(normalizedSize, sequence);
  const dataSize = normalizedSize - 44;
  const sampleRate = 8000;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  payload.write("RIFF", 0, "ascii");
  payload.writeUInt32LE(36 + dataSize, 4);
  payload.write("WAVE", 8, "ascii");
  payload.write("fmt ", 12, "ascii");
  payload.writeUInt32LE(16, 16);
  payload.writeUInt16LE(1, 20);
  payload.writeUInt16LE(channels, 22);
  payload.writeUInt32LE(sampleRate, 24);
  payload.writeUInt32LE(byteRate, 28);
  payload.writeUInt16LE(blockAlign, 32);
  payload.writeUInt16LE(bitsPerSample, 34);
  payload.write("data", 36, "ascii");
  payload.writeUInt32LE(dataSize, 40);
  return payload;
}

function buildTextItems(size: number, sequence: number): string[] {
  const itemCount = Math.min(16, Math.max(1, Math.ceil(size / 1024)));
  const itemSize = Math.max(8, Math.floor(size / itemCount));
  return Array.from({ length: itemCount }, (_, index) => buildTextPayload(itemSize, sequence + index));
}

function buildTextPayload(size: number, sequence: number): string {
  const seed = `synapse-rust-benchmark-${sequence}-`;
  let output = "";
  while (output.length < size) {
    output += seed;
  }
  return output.slice(0, size);
}

function formatErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const responseData = error.response.data as { error?: unknown; message?: unknown } | undefined;
      const responseMessage = responseData?.error || responseData?.message;
      return `HTTP ${error.response.status}${responseMessage ? `: ${String(responseMessage)}` : ""}`;
    }
    if (error.code === "ECONNABORTED") {
      return "request timeout";
    }
    if (error.code === "ERR_CANCELED") {
      return "request canceled";
    }
    return error.message || "network request failed";
  }

  return error instanceof Error ? error.message : String(error);
}

export const rustBenchmarkService = new RustBenchmarkService();
