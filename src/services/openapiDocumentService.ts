import fs from "node:fs";
import path from "node:path";
import swaggerJSDoc from "swagger-jsdoc";
import {
  AUDIT_LOG_ADAPTATION_STATUS,
  AUDIT_LOG_OPENAPI_EXTENSION,
  AUDIT_LOG_SOURCE,
  inferAuditModuleFromPath,
  isAuditLogRuntimeEnabled,
  isBackendApiPath,
} from "./auditLogMetadata";

interface OpenapiJsonCache {
  filePath: string;
  mtimeMs: number;
  content: string;
}

let openapiJsonCache: OpenapiJsonCache | null = null;
const GENERATED_OPENAPI_CACHE_KEY = "__generated_openapi__";
const OPENAPI_HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

type MutableOpenapiObject = Record<string, any>;

const runtimeSwaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Synapse API 文档",
      version: "1.0.0",
      description: "基于 OpenAPI 3.0 的接口文档",
    },
  },
  apis: [
    path.join(process.cwd(), "src/routes/**/*.ts"),
    path.join(process.cwd(), "dist/routes/**/*.js"),
  ],
};

export function getOpenapiJsonCandidates(): string[] {
  return [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    "/app/openapi.json",
    path.join(process.cwd(), "openapi.json"),
    path.join(__dirname, "../openapi.json"),
    path.join(process.cwd(), "dist/openapi.json"),
  ].filter(Boolean) as string[];
}

function formatOpenapiNotFoundError(candidates: string[]): Error {
  return new Error(`openapi.json not found in: ${candidates.join(" | ")}`);
}

function isRecord(value: unknown): value is MutableOpenapiObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildAuditLogMetadata(openapiPath: string, method?: string): MutableOpenapiObject {
  const isApiPath = isBackendApiPath(openapiPath);

  return {
    enabled: isApiPath && isAuditLogRuntimeEnabled(),
    coverage: isApiPath ? "all-api-routes" : "not-applicable",
    adaptationStatus: isApiPath ? AUDIT_LOG_ADAPTATION_STATUS : "not-applicable",
    source: isApiPath ? AUDIT_LOG_SOURCE : "not-applicable",
    module: isApiPath ? inferAuditModuleFromPath(openapiPath) : "other",
    action: method ? `${method.toUpperCase()} ${openapiPath}` : undefined,
  };
}

export function addAuditLogMetadataToOpenapiDocument<T extends MutableOpenapiObject>(document: T): T {
  const mutableDocument: MutableOpenapiObject = document;

  mutableDocument[AUDIT_LOG_OPENAPI_EXTENSION] = {
    enabled: isAuditLogRuntimeEnabled(),
    coverage: "all-api-routes",
    adaptationStatus: AUDIT_LOG_ADAPTATION_STATUS,
    source: AUDIT_LOG_SOURCE,
    dynamic: true,
  };

  if (!isRecord(mutableDocument.paths)) {
    return document;
  }

  for (const [openapiPath, pathItem] of Object.entries(mutableDocument.paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }

    pathItem[AUDIT_LOG_OPENAPI_EXTENSION] = buildAuditLogMetadata(openapiPath);

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!OPENAPI_HTTP_METHODS.has(method.toLowerCase()) || !isRecord(operation)) {
        continue;
      }

      operation[AUDIT_LOG_OPENAPI_EXTENSION] = buildAuditLogMetadata(openapiPath, method);
    }
  }

  return document;
}

function stringifyOpenapiDocument(document: MutableOpenapiObject): string {
  return `${JSON.stringify(addAuditLogMetadataToOpenapiDocument(document), null, 2)}\n`;
}

function addAuditLogMetadataToOpenapiJson(content: string): string {
  return stringifyOpenapiDocument(JSON.parse(content));
}

function generateOpenapiJson(): string {
  const swaggerSpec = swaggerJSDoc(runtimeSwaggerOptions) as MutableOpenapiObject;
  return stringifyOpenapiDocument(swaggerSpec);
}

export function readOpenapiJsonSync(): string {
  const candidates = getOpenapiJsonCandidates();

  for (const candidate of candidates) {
    try {
      const stats = fs.statSync(candidate);
      if (!stats.isFile()) {
        continue;
      }

      if (openapiJsonCache?.filePath === candidate && openapiJsonCache.mtimeMs === stats.mtimeMs) {
        return openapiJsonCache.content;
      }

      const content = addAuditLogMetadataToOpenapiJson(fs.readFileSync(candidate, "utf-8"));
      openapiJsonCache = { filePath: candidate, mtimeMs: stats.mtimeMs, content };
      return content;
    } catch (_error) {
      // Try the next candidate path.
    }
  }

  try {
    if (openapiJsonCache?.filePath === GENERATED_OPENAPI_CACHE_KEY) {
      return openapiJsonCache.content;
    }

    const content = generateOpenapiJson();
    openapiJsonCache = { filePath: GENERATED_OPENAPI_CACHE_KEY, mtimeMs: 0, content };
    return content;
  } catch (_error) {
    throw formatOpenapiNotFoundError(candidates);
  }
}

export async function readOpenapiJson(): Promise<string> {
  const candidates = getOpenapiJsonCandidates();

  for (const candidate of candidates) {
    try {
      const stats = await fs.promises.stat(candidate);
      if (!stats.isFile()) {
        continue;
      }

      if (openapiJsonCache?.filePath === candidate && openapiJsonCache.mtimeMs === stats.mtimeMs) {
        return openapiJsonCache.content;
      }

      const content = addAuditLogMetadataToOpenapiJson(await fs.promises.readFile(candidate, "utf-8"));
      openapiJsonCache = { filePath: candidate, mtimeMs: stats.mtimeMs, content };
      return content;
    } catch (_error) {
      // Try the next candidate path.
    }
  }

  try {
    if (openapiJsonCache?.filePath === GENERATED_OPENAPI_CACHE_KEY) {
      return openapiJsonCache.content;
    }

    const content = generateOpenapiJson();
    openapiJsonCache = { filePath: GENERATED_OPENAPI_CACHE_KEY, mtimeMs: 0, content };
    return content;
  } catch (_error) {
    throw formatOpenapiNotFoundError(candidates);
  }
}

export function shouldServeSwaggerFromJsonUrl(): boolean {
  if (process.env.OPENAPI_JSON_PATH) {
    return true;
  }

  try {
    return fs.statSync("/app/openapi.json").isFile();
  } catch (_error) {
    return false;
  }
}
