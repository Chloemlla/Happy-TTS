#!/usr/bin/env node

const { performance } = require("node:perf_hooks");

const TARGET_DEFAULTS = {
  "network-tools": {
    url: process.env.RUST_NETWORK_TOOLS_URL || "http://127.0.0.1:4010",
    operation: "network-dns",
  },
  "audio-worker": {
    url: process.env.RUST_AUDIO_WORKER_URL || "http://127.0.0.1:4020",
    operation: "audio-passthrough",
  },
  "file-worker": {
    url: process.env.RUST_FILE_WORKER_URL || "http://127.0.0.1:4030",
    operation: "file-hash",
  },
  "data-tools": {
    url: process.env.RUST_DATA_TOOLS_URL || "http://127.0.0.1:4040",
    operation: "data-hash",
  },
  "security-worker": {
    url: process.env.RUST_SECURITY_WORKER_URL || "http://127.0.0.1:4050",
    operation: "security-risk-score",
  },
};

const OPERATIONS = {
  health: {
    target: "any",
    method: "GET",
    path: "/healthz",
    body: () => undefined,
  },
  "network-dns": {
    target: "network-tools",
    method: "POST",
    path: "/v1/network/dns",
    targetValue: "example.com",
    body: (options) => ({
      address: options.targetValue || "example.com",
      recordTypes: ["A", "AAAA"],
      timeoutMs: Math.min(options.timeoutMs, 10000),
    }),
  },
  "network-http-timing": {
    target: "network-tools",
    method: "POST",
    path: "/v1/network/http-timing",
    targetValue: "https://example.com",
    body: (options) => ({
      url: options.targetValue || "https://example.com",
      method: "GET",
      timeoutMs: Math.min(options.timeoutMs, 15000),
      maxBytes: Math.min(options.payloadBytes, 64 * 1024),
    }),
  },
  "file-hash": {
    target: "file-worker",
    method: "POST",
    path: "/v1/file/hash",
    body: (options, sequence) => ({
      fileBase64: buildPayloadBuffer(options.payloadBytes, sequence).toString("base64"),
      algorithms: ["sha256", "sha512"],
    }),
  },
  "file-inspect": {
    target: "file-worker",
    method: "POST",
    path: "/v1/file/inspect",
    body: (options, sequence) => ({
      fileBase64: buildPayloadBuffer(options.payloadBytes, sequence).toString("base64"),
      fileName: "benchmark.bin",
      declaredMime: "application/octet-stream",
    }),
  },
  "audio-passthrough": {
    target: "audio-worker",
    method: "POST",
    path: "/v1/audio/process",
    body: (options, sequence) => ({
      audioBase64: buildWavPayload(options.payloadBytes, sequence).toString("base64"),
      outputFormat: "wav",
      taskId: `bench-cli-${Date.now()}-${sequence}`,
      contentHash: `bench-cli-${sequence}`,
      operations: ["passthrough", "analyze"],
    }),
  },
  "data-hash": {
    target: "data-tools",
    method: "POST",
    path: "/v1/data/hash",
    body: (options, sequence) => ({
      items: buildTextItems(options.payloadBytes, sequence),
      algorithm: "sha256",
    }),
  },
  "data-json-inspect": {
    target: "data-tools",
    method: "POST",
    path: "/v1/data/json/inspect",
    body: (options, sequence) => ({
      text: JSON.stringify({
        sequence,
        payload: buildTextPayload(Math.max(16, options.payloadBytes - 64), sequence),
      }),
    }),
  },
  "security-risk-score": {
    target: "security-worker",
    method: "POST",
    path: "/v1/security/risk/score",
    body: (_options, sequence) => ({
      signals: {
        tor: false,
        vpn: sequence % 7 === 0,
        failedLoginCount: sequence % 11,
        requestRatePerMinute: 60 + (sequence % 90),
        userAgent: "SynapseRustBenchmarkCLI/1.0",
        newDevice: sequence % 5 === 0,
        newLocation: sequence % 9 === 0,
      },
    }),
  },
  "security-content-scan": {
    target: "security-worker",
    method: "POST",
    path: "/v1/security/content/scan",
    body: (options, sequence) => ({
      text: `benchmark-${sequence} ${buildTextPayload(options.payloadBytes, sequence)} token-alpha`,
      rules: [
        { id: "token-alpha", pattern: "token-alpha", severity: 2 },
        { id: "token-beta", pattern: "token-beta", severity: 5 },
      ],
      caseSensitive: false,
    }),
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const target = args.target || "network-tools";
  const targetDefault = TARGET_DEFAULTS[target];
  if (!targetDefault) {
    throw new Error(`Unsupported target: ${target}`);
  }

  const operation = args.operation || targetDefault.operation;
  const operationDefinition = OPERATIONS[operation];
  if (!operationDefinition) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  if (operationDefinition.target !== "any" && operationDefinition.target !== target) {
    throw new Error(`Operation ${operation} cannot run against ${target}`);
  }

  const options = {
    target,
    operation,
    baseUrl: args.url || targetDefault.url,
    token: args.token || process.env.RUST_BENCHMARK_INTERNAL_TOKEN || process.env.INTERNAL_SERVICE_TOKEN || "",
    durationMs: clampInteger(args.durationMs, 1000, 300000, 30000),
    concurrency: clampInteger(args.concurrency, 1, 128, 8),
    payloadBytes: clampInteger(args.payloadBytes, 16, 1024 * 1024, 4096),
    timeoutMs: clampInteger(args.timeoutMs, 100, 60000, 5000),
    targetValue: args.targetValue || operationDefinition.targetValue || "",
    json: Boolean(args.json),
  };

  if (!options.token) {
    console.warn("[rust-benchmark] INTERNAL_SERVICE_TOKEN is empty; the Rust worker will likely reject requests.");
  }

  const result = await runBenchmark(options, operationDefinition);
  output(options, result, true);
}

async function runBenchmark(options, operationDefinition) {
  const state = {
    startedAt: Date.now(),
    durationMs: options.durationMs,
    total: 0,
    success: 0,
    failed: 0,
    inFlight: 0,
    latencies: [],
    errors: new Map(),
  };
  let sequence = 0;
  let stopped = false;
  const deadline = state.startedAt + options.durationMs;
  const reporter = setInterval(() => output(options, snapshot(state), false), 1000);

  const workers = Array.from({ length: options.concurrency }, async () => {
    while (!stopped && Date.now() < deadline) {
      const currentSequence = ++sequence;
      await executeOne(options, operationDefinition, currentSequence, state);
    }
  });

  process.once("SIGINT", () => {
    stopped = true;
  });

  await Promise.all(workers);
  clearInterval(reporter);
  return snapshot(state);
}

async function executeOne(options, operationDefinition, sequence, state) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const started = performance.now();
  state.inFlight += 1;

  try {
    const response = await fetch(buildUrl(options.baseUrl, operationDefinition.path), {
      method: operationDefinition.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Internal-Token": options.token,
      },
      body: operationDefinition.method === "GET" ? undefined : JSON.stringify(operationDefinition.body(options, sequence)),
      signal: controller.signal,
    });

    const latency = performance.now() - started;
    recordLatency(state, latency);
    state.total += 1;
    if (response.ok) {
      state.success += 1;
      await response.arrayBuffer();
    } else {
      state.failed += 1;
      recordError(state, `HTTP ${response.status}`);
      await response.arrayBuffer();
    }
  } catch (error) {
    const latency = performance.now() - started;
    recordLatency(state, latency);
    state.total += 1;
    state.failed += 1;
    recordError(state, error && error.name === "AbortError" ? "request timeout" : error.message || String(error));
  } finally {
    clearTimeout(timer);
    state.inFlight -= 1;
  }
}

function snapshot(state) {
  const elapsedMs = Date.now() - state.startedAt;
  const sorted = [...state.latencies].sort((left, right) => left - right);
  return {
    elapsedMs,
    durationMs: state.durationMs,
    total: state.total,
    success: state.success,
    failed: state.failed,
    inFlight: state.inFlight,
    rps: elapsedMs > 0 ? round((state.total / elapsedMs) * 1000) : 0,
    successRate: state.total > 0 ? round((state.success / state.total) * 100) : 0,
    latency: {
      avgMs: state.latencies.length ? round(state.latencies.reduce((sum, value) => sum + value, 0) / state.latencies.length) : null,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      maxMs: sorted.length ? sorted[sorted.length - 1] : null,
    },
    errors: [...state.errors.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
  };
}

function output(options, result, final) {
  const payload = {
    final,
    target: options.target,
    operation: options.operation,
    baseUrl: options.baseUrl,
    targetValue: options.targetValue || undefined,
    ...result,
  };

  if (options.json) {
    console.log(JSON.stringify(payload));
    return;
  }

  const prefix = final ? "FINAL" : "LIVE ";
  const latency = result.latency.p95Ms === null ? "-" : `${result.latency.p95Ms}ms`;
  console.log(
    `[${prefix}] ${options.target}/${options.operation} elapsed=${formatDuration(result.elapsedMs)} total=${result.total} ok=${result.success} fail=${result.failed} rps=${result.rps} p95=${latency}`,
  );
  if (final && result.errors.length) {
    console.log("Errors:");
    for (const item of result.errors) {
      console.log(`  ${item.count}x ${item.message}`);
    }
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue !== undefined ? inlineValue : argv[++index];
    const normalizedKey = key.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    parsed[normalizedKey] = value;
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-rust-worker-benchmark.js [options]

Options:
  --target network-tools|audio-worker|file-worker|data-tools|security-worker
  --operation health|network-dns|network-http-timing|file-hash|file-inspect|audio-passthrough|data-hash|data-json-inspect|security-risk-score|security-content-scan
  --url http://127.0.0.1:4010
  --token INTERNAL_SERVICE_TOKEN
  --duration-ms 30000
  --concurrency 8
  --payload-bytes 4096
  --timeout-ms 5000
  --target-value example.com
  --json`);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function buildUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function recordLatency(state, value) {
  state.latencies.push(round(value));
  if (state.latencies.length > 50000) {
    state.latencies.splice(0, state.latencies.length - 50000);
  }
}

function recordError(state, message) {
  state.errors.set(message, (state.errors.get(message) || 0) + 1);
}

function percentile(sortedValues, quantile) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * quantile) - 1));
  return sortedValues[index];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

function buildPayloadBuffer(size, sequence) {
  const payload = Buffer.alloc(size);
  const seed = Buffer.from(`Synapse Rust benchmark ${sequence}\n`, "utf8");
  for (let index = 0; index < payload.length; index++) {
    payload[index] = seed[index % seed.length] ^ (index & 0xff);
  }
  return payload;
}

function buildWavPayload(size, sequence) {
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

function buildTextItems(size, sequence) {
  const itemCount = Math.min(16, Math.max(1, Math.ceil(size / 1024)));
  const itemSize = Math.max(8, Math.floor(size / itemCount));
  return Array.from({ length: itemCount }, (_value, index) => buildTextPayload(itemSize, sequence + index));
}

function buildTextPayload(size, sequence) {
  const seed = `synapse-rust-benchmark-${sequence}-`;
  let output = "";
  while (output.length < size) {
    output += seed;
  }
  return output.slice(0, size);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
