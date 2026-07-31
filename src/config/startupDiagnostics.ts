import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { startupConfig } from "./config";

export type ReadinessStatus = "ready" | "failed" | "skipped";

export interface DependencyReadiness {
  name: "openai" | "fish" | "redis" | "mongo" | "mysql" | "email";
  required: boolean;
  status: ReadinessStatus;
  message: string;
  latencyMs?: number;
}

export interface ConfigDiagnosticReport {
  generatedAt: string;
  compileTimeConfig: {
    timezone: string;
    audioDir: string;
    dataDir: string;
    logsDir: string;
    runtimeMutableKeys: readonly string[];
  };
  startupConfig: {
    nodeEnv: string;
    port: number;
    baseUrl: string;
    frontendBaseUrl: string;
    userStorageMode: string;
    ipBanStorage: string;
    wafEnabled: boolean;
    openaiConfigured: boolean;
    redisConfigured: boolean;
    mongoConfigured: boolean;
    mysqlConfigured: boolean;
    emailConfigured: boolean;
    outemailEnabled: boolean;
    jwtSecretConfigured: boolean;
    signSecretKeyConfigured: boolean;
    adminPasswordConfigured: boolean;
    serverPasswordConfigured: boolean;
    passwordEncryptionKeyConfigured: boolean;
    internalServiceTokenConfigured: boolean;
  };
  runtimeMutableConfig: {
    provider: "RuntimeConfigService";
    keys: readonly string[];
  };
  dependencies: DependencyReadiness[];
  summary: {
    ready: number;
    failed: number;
    skipped: number;
    requiredFailures: number;
  };
}

let latestStartupReport: ConfigDiagnosticReport | null = null;

function now() {
  return Date.now();
}

function withLatency(startedAt: number, readiness: Omit<DependencyReadiness, "latencyMs">): DependencyReadiness {
  return {
    ...readiness,
    latencyMs: Date.now() - startedAt,
  };
}

function normalizeOpenAiBaseUrl(baseUrl?: string): string {
  const normalized = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  return normalized.endsWith("/models") ? normalized : `${normalized}/models`;
}

async function probeOpenAi(): Promise<DependencyReadiness> {
  const startedAt = now();
  const required = false;
  const apiKey = startupConfig.openai.apiKey;

  if (!apiKey) {
    return withLatency(startedAt, {
      name: "openai",
      required,
      status: "skipped",
      message: "OPENAI_API_KEY / OPENAI_KEY 未配置",
    });
  }

  try {
    const response = await fetch(normalizeOpenAiBaseUrl(startupConfig.openai.baseUrl), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return withLatency(startedAt, {
        name: "openai",
        required,
        status: "ready",
        message: "OpenAI API 连通性正常",
      });
    }

    return withLatency(startedAt, {
      name: "openai",
      required,
      status: "failed",
      message: `OpenAI readiness 返回 ${response.status}`,
    });
  } catch (error) {
    return withLatency(startedAt, {
      name: "openai",
      required,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function probeRedis(): Promise<DependencyReadiness> {
  const startedAt = now();
  const required = false;

  if (!startupConfig.redis.url) {
    return withLatency(startedAt, {
      name: "redis",
      required,
      status: "skipped",
      message: "REDIS_URL 未配置",
    });
  }

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: startupConfig.redis.url });
    await client.connect();
    await client.ping();
    return withLatency(startedAt, {
      name: "redis",
      required,
      status: "ready",
      message: "Redis PING 成功",
    });
  } catch (error) {
    return withLatency(startedAt, {
      name: "redis",
      required,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (client?.isOpen) {
      await client.quit().catch(() => undefined);
    }
  }
}

async function probeMongo(): Promise<DependencyReadiness> {
  const startedAt = now();
  const required = true;

  if (!startupConfig.mongo.uri) {
    return withLatency(startedAt, {
      name: "mongo",
      required,
      status: required ? "failed" : "skipped",
      message: "MONGO_URI / MONGODB_URI 未配置",
    });
  }

  let client: MongoClient | null = null;
  try {
    client = new MongoClient(startupConfig.mongo.uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await client.connect();
    await client.db(startupConfig.mongo.database).command({ ping: 1 });
    return withLatency(startedAt, {
      name: "mongo",
      required,
      status: "ready",
      message: "MongoDB ping 成功",
    });
  } catch (error) {
    return withLatency(startedAt, {
      name: "mongo",
      required,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await client?.close().catch(() => undefined);
  }
}

async function probeMysql(): Promise<DependencyReadiness> {
  const startedAt = now();
  return withLatency(startedAt, {
    name: "mysql",
    required: false,
    status: "skipped",
    message: "当前版本未启用 MySQL 存储",
  });
}

async function probeEmail(): Promise<DependencyReadiness> {
  const startedAt = now();
  const required = false;
  const apiKey = startupConfig.email.outemail.apiKey || startupConfig.email.resendApiKey;

  if (!apiKey) {
    return withLatency(startedAt, {
      name: "email",
      required,
      status: required ? "failed" : "skipped",
      message: "RESEND_API_KEY / OUTEMAIL_API_KEY 未配置",
    });
  }

  try {
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return withLatency(startedAt, {
        name: "email",
        required,
        status: "ready",
        message: "Resend API 连通性正常",
      });
    }

    return withLatency(startedAt, {
      name: "email",
      required,
      status: "failed",
      message: `Resend readiness 返回 ${response.status}`,
    });
  } catch (error) {
    return withLatency(startedAt, {
      name: "email",
      required,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runStartupDiagnostics(compileTimeConfig: {
  timezone: string;
  audioDir: string;
  dataDir: string;
  logsDir: string;
  runtimeMutableKeys: readonly string[];
}): Promise<ConfigDiagnosticReport> {
  const dependencies = await Promise.all([
    probeOpenAi(),
    probeRedis(),
    probeMongo(),
    probeMysql(),
    probeEmail(),
  ]);

  const summary = dependencies.reduce<ConfigDiagnosticReport["summary"]>(
    (acc, item) => {
      acc[item.status] += 1;
      if (item.required && item.status === "failed") {
        acc.requiredFailures += 1;
      }
      return acc;
    },
    { ready: 0, failed: 0, skipped: 0, requiredFailures: 0 },
  );

  latestStartupReport = {
    generatedAt: new Date().toISOString(),
    compileTimeConfig,
    startupConfig: {
      nodeEnv: startupConfig.nodeEnv,
      port: startupConfig.port,
      baseUrl: startupConfig.baseUrl,
      frontendBaseUrl: startupConfig.frontendBaseUrl,
      userStorageMode: "mongo",
      ipBanStorage: startupConfig.ipBanStorage,
      wafEnabled: startupConfig.security.wafEnabled,
      openaiConfigured: Boolean(startupConfig.openai.apiKey),
      redisConfigured: Boolean(startupConfig.redis.url),
      mongoConfigured: Boolean(startupConfig.mongo.uri),
      mysqlConfigured: false,
      emailConfigured: Boolean(startupConfig.email.resendApiKey || startupConfig.email.outemail.apiKey),
      outemailEnabled: startupConfig.email.outemail.enabled,
      jwtSecretConfigured: startupConfig.configuredSecrets.jwtSecret,
      signSecretKeyConfigured: startupConfig.configuredSecrets.signSecretKey,
      adminPasswordConfigured: startupConfig.configuredSecrets.adminPassword,
      serverPasswordConfigured: startupConfig.configuredSecrets.serverPassword,
      passwordEncryptionKeyConfigured: startupConfig.configuredSecrets.passwordEncryptionKey,
      internalServiceTokenConfigured: startupConfig.configuredSecrets.internalServiceToken,
    },
    runtimeMutableConfig: {
      provider: "RuntimeConfigService",
      keys: compileTimeConfig.runtimeMutableKeys,
    },
    dependencies,
    summary,
  };

  return latestStartupReport;
}

export function getStartupDiagnosticsReport(): ConfigDiagnosticReport | null {
  return latestStartupReport;
}
