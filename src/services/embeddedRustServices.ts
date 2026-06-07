import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { spawn, type ChildProcess } from "node:child_process";
import { config } from "../config/config";
import logger from "../utils/logger";

interface EmbeddedRustServiceDefinition {
  name: "network-tools" | "audio-worker";
  enabled: boolean;
  url: string;
  binPath: string;
  bindEnvName: "RUST_BIND_ADDR" | "RUST_AUDIO_WORKER_BIND_ADDR";
  extraEnv: Record<string, string>;
}

const children: ChildProcess[] = [];
let started = false;

export async function startEmbeddedRustServices(): Promise<void> {
  if (started || process.env.NODE_ENV === "test") {
    return;
  }

  started = true;

  if (!config.rustServices.embedded.enabled) {
    logger.info("[Rust] Embedded Rust services disabled; expecting external sidecars when Rust flags are enabled");
    return;
  }

  if (config.rustServices.embedded.generatedInternalToken) {
    logger.warn("[Rust] INTERNAL_SERVICE_TOKEN is not set; generated an ephemeral token for embedded Rust services");
  }

  const services: EmbeddedRustServiceDefinition[] = [
    {
      name: "network-tools",
      enabled: config.rustServices.networkTools.enabled,
      url: config.rustServices.networkTools.url,
      binPath: config.rustServices.embedded.networkToolsBin,
      bindEnvName: "RUST_BIND_ADDR",
      extraEnv: {
        RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS: String(config.rustServices.networkTools.blockPrivateTargets),
      },
    },
    {
      name: "audio-worker",
      enabled: config.rustServices.audioWorker.enabled,
      url: config.rustServices.audioWorker.url,
      binPath: config.rustServices.embedded.audioWorkerBin,
      bindEnvName: "RUST_AUDIO_WORKER_BIND_ADDR",
      extraEnv: {
        RUST_AUDIO_WORKER_MAX_BYTES: String(config.rustServices.audioWorker.maxBytes),
      },
    },
  ];

  registerShutdownHandlers();

  for (const service of services) {
    await startService(service);
  }
}

async function startService(service: EmbeddedRustServiceDefinition): Promise<void> {
  if (!service.enabled) {
    return;
  }

  const parsedUrl = parseServiceUrl(service.url);
  if (!parsedUrl || !isLoopbackHost(parsedUrl.hostname)) {
    logger.info("[Rust] Embedded Rust service skipped because URL is not loopback", {
      service: service.name,
      url: service.url,
    });
    return;
  }

  if (!existsSync(service.binPath)) {
    logger.warn("[Rust] Embedded Rust binary not found; service will not be started by Node", {
      service: service.name,
      binPath: service.binPath,
    });
    return;
  }

  const bindAddr = `${normalizeBindHost(parsedUrl.hostname)}:${parsedUrl.port}`;
  const child = spawn(service.binPath, [], {
    env: {
      ...process.env,
      INTERNAL_SERVICE_TOKEN: config.rustServices.internalToken,
      [service.bindEnvName]: bindAddr,
      ...service.extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);

  child.stdout?.on("data", (chunk) => {
    logger.info(`[Rust:${service.name}] ${chunk.toString().trim()}`);
  });
  child.stderr?.on("data", (chunk) => {
    logger.warn(`[Rust:${service.name}] ${chunk.toString().trim()}`);
  });
  child.on("exit", (code, signal) => {
    logger.warn("[Rust] Embedded Rust service exited", {
      service: service.name,
      code,
      signal,
    });
  });
  child.on("error", (error) => {
    logger.error("[Rust] Embedded Rust service failed to start", {
      service: service.name,
      error: error.message,
    });
  });

  logger.info("[Rust] Embedded Rust service spawned", {
    service: service.name,
    pid: child.pid,
    bindAddr,
  });

  await waitForHealth(service.name, service.url, config.rustServices.internalToken, 5000);
}

function parseServiceUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.port) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

function normalizeBindHost(hostname: string): string {
  return hostname === "localhost" ? "127.0.0.1" : hostname.replace(/^\[|\]$/g, "");
}

async function waitForHealth(
  serviceName: EmbeddedRustServiceDefinition["name"],
  baseUrl: string,
  internalToken: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = new URL("/healthz", baseUrl);

  while (Date.now() < deadline) {
    if (await requestHealth(healthUrl, internalToken)) {
      logger.info("[Rust] Embedded Rust service is healthy", { service: serviceName });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  logger.warn("[Rust] Embedded Rust health check timed out; Node will continue startup", {
    service: serviceName,
    timeoutMs,
  });
}

function requestHealth(url: URL, internalToken: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        headers: {
          "X-Internal-Token": internalToken,
        },
        timeout: 1000,
      },
      (response) => {
        response.resume();
        resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300));
      },
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
    request.end();
  });
}

function registerShutdownHandlers() {
  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  process.once("exit", shutdown);
  process.once("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}
