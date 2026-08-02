"use strict";

const crypto = require("node:crypto");
const { MongoClient } = require("mongodb");

const BASE_URL = (process.env.LOAD_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const CONCURRENCY = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 20));
const DURATION_MS = Math.max(1_000, Number(process.env.LOAD_TEST_DURATION_MS || 60_000));
const REQUEST_TIMEOUT_MS = Math.max(500, Number(process.env.LOAD_TEST_REQUEST_TIMEOUT_MS || 10_000));
const PROFILE_SAMPLE_INTERVAL_MS = Math.max(1_000, Number(process.env.LOAD_TEST_PROFILE_SAMPLE_INTERVAL_MS || 5_000));
const TTL_HOURS = Math.max(1, Number(process.env.LOAD_TEST_TTL_HOURS || 24));
const ADMIN_TOKEN = process.env.LOAD_TEST_ADMIN_TOKEN || "";
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/tts";
const COLLECTION_NAME = process.env.LOAD_TEST_REPORT_COLLECTION || "load_test_reports";
const REPORT_LABEL = process.env.LOAD_TEST_LABEL || "profiling-load-test";

const defaultEndpoints = [
  { name: "health", method: "GET", path: "/health", weight: 1 },
  { name: "status-public", method: "GET", path: "/api/status", weight: 2 },
  { name: "frontend-config", method: "GET", path: "/api/frontend-config", weight: 2 },
  { name: "proxy-test", method: "GET", path: "/api/proxy-test", weight: 2 },
  { name: "timing-test", method: "GET", path: "/api/timing-test", weight: 2 },
  { name: "openapi-json", method: "GET", path: "/api/openapi.json", weight: 1 },
];

const configuredEndpoints = (() => {
  const raw = process.env.LOAD_TEST_ENDPOINTS;
  if (!raw) return defaultEndpoints;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("LOAD_TEST_ENDPOINTS must be a non-empty JSON array");
    }
    return parsed;
  } catch (error) {
    console.warn("[load-test] Invalid LOAD_TEST_ENDPOINTS, falling back to defaults:", error.message);
    return defaultEndpoints;
  }
})();

const runId = `load_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}`;
const endTime = Date.now() + DURATION_MS;

const overall = {
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  timedOutRequests: 0,
  totalBytes: 0,
  byStatus: {},
  durations: [],
  slowestRequests: [],
  errorSamples: [],
};

const perEndpoint = new Map();
for (const endpoint of configuredEndpoints) {
  perEndpoint.set(`${endpoint.method} ${endpoint.path}`, {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    weight: endpoint.weight || 1,
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalBytes: 0,
    byStatus: {},
    durations: [],
    errorSamples: [],
  });
}

const runtimeSnapshots = [];

function weightedPick(endpoints) {
  const totalWeight = endpoints.reduce((sum, endpoint) => sum + (endpoint.weight || 1), 0);
  let cursor = Math.random() * totalWeight;
  for (const endpoint of endpoints) {
    cursor -= endpoint.weight || 1;
    if (cursor <= 0) {
      return endpoint;
    }
  }
  return endpoints[endpoints.length - 1];
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index] * 100) / 100;
}

function summarizeDurations(values) {
  if (!values.length) {
    return {
      minMs: null,
      avgMs: null,
      maxMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    minMs: Math.round(min * 100) / 100,
    avgMs: Math.round((total / values.length) * 100) / 100,
    maxMs: Math.round(max * 100) / 100,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
  };
}

function recordSlowRequest(sample) {
  overall.slowestRequests.push(sample);
  overall.slowestRequests.sort((a, b) => b.durationMs - a.durationMs);
  if (overall.slowestRequests.length > 20) {
    overall.slowestRequests.length = 20;
  }
}

function recordErrorSample(target, sample) {
  target.errorSamples.push(sample);
  if (target.errorSamples.length > 20) {
    target.errorSamples.shift();
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function captureProfilingSnapshot(stage) {
  if (!ADMIN_TOKEN) {
    return null;
  }

  const response = await fetchWithTimeout(`${BASE_URL}/api/status/profiling`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      Accept: "application/json",
    },
  }, Math.min(REQUEST_TIMEOUT_MS, 5_000));

  if (!response.ok) {
    throw new Error(`profiling snapshot failed with ${response.status}`);
  }

  const data = await response.json();
  const snapshot = {
    stage,
    capturedAt: new Date().toISOString(),
    data,
  };
  runtimeSnapshots.push(snapshot);
  return snapshot;
}

async function runWorker(workerId) {
  while (Date.now() < endTime) {
    const endpoint = weightedPick(configuredEndpoints);
    const aggregate = perEndpoint.get(`${endpoint.method} ${endpoint.path}`);
    const startedAt = Date.now();

    try {
      const response = await fetchWithTimeout(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          Accept: "application/json",
          "X-Load-Test-Run-Id": runId,
          "X-Load-Test-Worker": String(workerId),
          ...(endpoint.headers || {}),
        },
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      }, REQUEST_TIMEOUT_MS);

      const durationMs = Date.now() - startedAt;
      const contentLength = Number(response.headers.get("content-length") || 0) || 0;
      const ok = response.status >= 200 && response.status < 400;

      overall.totalRequests += 1;
      overall.totalBytes += contentLength;
      overall.byStatus[response.status] = (overall.byStatus[response.status] || 0) + 1;
      overall.durations.push(durationMs);
      aggregate.totalRequests += 1;
      aggregate.totalBytes += contentLength;
      aggregate.byStatus[response.status] = (aggregate.byStatus[response.status] || 0) + 1;
      aggregate.durations.push(durationMs);

      if (ok) {
        overall.successRequests += 1;
        aggregate.successRequests += 1;
      } else {
        overall.failedRequests += 1;
        aggregate.failedRequests += 1;
        recordErrorSample(overall, {
          path: endpoint.path,
          method: endpoint.method,
          statusCode: response.status,
          durationMs,
          capturedAt: new Date().toISOString(),
        });
        recordErrorSample(aggregate, {
          statusCode: response.status,
          durationMs,
          capturedAt: new Date().toISOString(),
        });
      }

      recordSlowRequest({
        path: endpoint.path,
        method: endpoint.method,
        statusCode: response.status,
        durationMs,
        contentLength,
        capturedAt: new Date().toISOString(),
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);

      overall.totalRequests += 1;
      overall.failedRequests += 1;
      overall.timedOutRequests += /abort/i.test(message) ? 1 : 0;
      overall.durations.push(durationMs);
      aggregate.totalRequests += 1;
      aggregate.failedRequests += 1;
      aggregate.durations.push(durationMs);

      recordErrorSample(overall, {
        path: endpoint.path,
        method: endpoint.method,
        error: message,
        durationMs,
        capturedAt: new Date().toISOString(),
      });
      recordErrorSample(aggregate, {
        error: message,
        durationMs,
        capturedAt: new Date().toISOString(),
      });
      recordSlowRequest({
        path: endpoint.path,
        method: endpoint.method,
        statusCode: 0,
        durationMs,
        error: message,
        capturedAt: new Date().toISOString(),
      });
    }
  }
}

async function persistReport(report) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  try {
    const db = client.db();
    const collection = db.collection(COLLECTION_NAME);
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await collection.createIndex({ runId: 1 }, { unique: true });
    await collection.createIndex({ createdAt: -1 });
    await collection.insertOne(report);
  } finally {
    await client.close();
  }
}

async function main() {
  const startedAt = new Date();
  console.log("[load-test] Starting run", {
    runId,
    baseUrl: BASE_URL,
    concurrency: CONCURRENCY,
    durationMs: DURATION_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    ttlHours: TTL_HOURS,
    endpoints: configuredEndpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
  });

  try {
    await captureProfilingSnapshot("before");
  } catch (error) {
    console.warn("[load-test] Failed to capture pre-run profiling snapshot:", error.message);
  }

  const sampler = setInterval(() => {
    void captureProfilingSnapshot("during").catch((error) => {
      console.warn("[load-test] Periodic profiling snapshot failed:", error.message);
    });
  }, PROFILE_SAMPLE_INTERVAL_MS);
  sampler.unref();

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => runWorker(index + 1)));
  clearInterval(sampler);

  try {
    await captureProfilingSnapshot("after");
  } catch (error) {
    console.warn("[load-test] Failed to capture post-run profiling snapshot:", error.message);
  }

  const finishedAt = new Date();
  const elapsedMs = finishedAt.getTime() - startedAt.getTime();
  const overallLatency = summarizeDurations(overall.durations);
  const endpointSummaries = Array.from(perEndpoint.values()).map((aggregate) => ({
    name: aggregate.name,
    method: aggregate.method,
    path: aggregate.path,
    weight: aggregate.weight,
    totalRequests: aggregate.totalRequests,
    successRequests: aggregate.successRequests,
    failedRequests: aggregate.failedRequests,
    totalBytes: aggregate.totalBytes,
    byStatus: aggregate.byStatus,
    latency: summarizeDurations(aggregate.durations),
    errorSamples: aggregate.errorSamples,
  }));

  const report = {
    runId,
    label: REPORT_LABEL,
    kind: "profiling-load-test",
    ephemeral: true,
    createdAt: startedAt,
    finishedAt,
    expiresAt: new Date(finishedAt.getTime() + TTL_HOURS * 60 * 60 * 1000),
    config: {
      baseUrl: BASE_URL,
      concurrency: CONCURRENCY,
      durationMs: DURATION_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      profileSampleIntervalMs: PROFILE_SAMPLE_INTERVAL_MS,
      ttlHours: TTL_HOURS,
      endpoints: configuredEndpoints,
      profilingSnapshotEnabled: Boolean(ADMIN_TOKEN),
    },
    summary: {
      elapsedMs,
      requestsPerSecond: Math.round((overall.totalRequests / (elapsedMs / 1000)) * 100) / 100,
      totalRequests: overall.totalRequests,
      successRequests: overall.successRequests,
      failedRequests: overall.failedRequests,
      timedOutRequests: overall.timedOutRequests,
      successRate:
        overall.totalRequests > 0 ? Math.round((overall.successRequests / overall.totalRequests) * 10_000) / 100 : 0,
      totalBytes: overall.totalBytes,
      byStatus: overall.byStatus,
      latency: overallLatency,
    },
    endpointSummaries,
    profilingSnapshots: runtimeSnapshots,
    slowestRequests: overall.slowestRequests,
    errorSamples: overall.errorSamples,
  };

  await persistReport(report);

  console.log("[load-test] Completed", {
    runId,
    elapsedMs,
    summary: report.summary,
    mongoCollection: COLLECTION_NAME,
    expiresAt: report.expiresAt.toISOString(),
  });
}

main().catch((error) => {
  console.error("[load-test] Failed:", error);
  process.exit(1);
});
