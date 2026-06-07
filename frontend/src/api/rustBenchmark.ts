import api from './api';

export type RustBenchmarkTarget =
  | 'network-tools'
  | 'audio-worker'
  | 'file-worker'
  | 'data-tools'
  | 'security-worker';

export type RustBenchmarkOperation =
  | 'health'
  | 'network-dns'
  | 'network-http-timing'
  | 'file-hash'
  | 'file-inspect'
  | 'audio-passthrough'
  | 'data-hash'
  | 'data-json-inspect'
  | 'security-risk-score'
  | 'security-content-scan';

export type RustBenchmarkStatus = 'idle' | 'running' | 'stopping' | 'completed' | 'failed';

export interface RustBenchmarkTargetInfo {
  id: RustBenchmarkTarget;
  label: string;
  defaultBaseUrl: string;
  configured: boolean;
  defaultOperation: RustBenchmarkOperation;
  operations: RustBenchmarkOperation[];
}

export interface RustBenchmarkStartPayload {
  target: RustBenchmarkTarget;
  operation: RustBenchmarkOperation;
  durationMs: number;
  concurrency: number;
  payloadBytes: number;
  timeoutMs: number;
  targetValue?: string;
  baseUrl?: string;
  internalToken?: string;
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
  errors: Array<{
    message: string;
    count: number;
    lastAt: string;
  }>;
  samples: Array<{
    at: string;
    ok: boolean;
    latencyMs: number;
    statusCode?: number;
    error?: string;
  }>;
}

export async function getRustBenchmarkTargets(): Promise<RustBenchmarkTargetInfo[]> {
  const response = await api.get('/api/rust-benchmark/targets');
  return response.data.data;
}

export async function getRustBenchmarkStatus(): Promise<RustBenchmarkSnapshot> {
  const response = await api.get('/api/rust-benchmark/status');
  return response.data.data;
}

export async function startRustBenchmark(payload: RustBenchmarkStartPayload): Promise<RustBenchmarkSnapshot> {
  const response = await api.post('/api/rust-benchmark/start', payload);
  return response.data.data;
}

export async function stopRustBenchmark(): Promise<RustBenchmarkSnapshot> {
  const response = await api.post('/api/rust-benchmark/stop');
  return response.data.data;
}
