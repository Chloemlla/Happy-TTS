import type { IAuditLog } from "../models/auditLogModel";

export const AUDIT_LOG_ADAPTATION_STATUS = "completed" as const;
export const AUDIT_LOG_OPENAPI_EXTENSION = "x-audit-log";
export const AUDIT_LOG_SOURCE = "AuditLogService.globalAuditMiddleware";
export const BACKEND_API_PREFIX = "/api";

export const ALLOWED_AUDIT_MODULES = new Set<IAuditLog["module"]>([
  "auth",
  "user",
  "system",
  "cdk",
  "api",
  "admin",
  "security",
  "config",
  "email",
  "tts",
  "shorturl",
  "ipfs",
  "media",
  "network",
  "life",
  "social",
  "lottery",
  "workspace",
  "resource",
  "recommendation",
  "policy",
  "debug",
  "ipban",
  "env",
  "announcement",
  "other",
]);

const AUDIT_MODULE_ALIASES: Record<string, IAuditLog["module"]> = {
  apikeys: "api",
  "api-keys": "api",
  "api-docs": "api",
  "api-docs.json": "api",
  cdks: "cdk",
  "data-collection": "security",
  data: "api",
  "debug-console": "debug",
  "fbi-wanted": "api",
  "frontend-config": "config",
  "github-billing": "api",
  "human-check": "security",
  "image-data": "api",
  "ip-info": "network",
  "ip-verification": "security",
  "libre-chat": "api",
  librechat: "api",
  miniapi: "api",
  modlist: "api",
  nexai: "api",
  openapi: "api",
  "openapi.json": "api",
  outemail: "email",
  passkey: "auth",
  resources: "resource",
  sharelog: "api",
  tickets: "system",
  totp: "auth",
  turnstile: "security",
  "webhook-events": "admin",
  webhooks: "api",
};

export function isAuditLogRuntimeEnabled(): boolean {
  return process.env.GLOBAL_AUDIT_ENABLED !== "false";
}

export function isBackendApiPath(pathname: string): boolean {
  return pathname === BACKEND_API_PREFIX || pathname.startsWith(`${BACKEND_API_PREFIX}/`);
}

function getPathname(rawPath: string): string {
  const [pathname] = rawPath.split("?");
  return pathname || "/";
}

function normalizeRouteSegment(segment: string | undefined): string {
  return String(segment || "")
    .trim()
    .toLowerCase();
}

export function inferAuditModuleFromPath(rawPath: string): IAuditLog["module"] {
  const pathname = getPathname(rawPath);
  const segments = pathname.split("/").filter(Boolean);
  const routeSegment = segments[0] === "api" ? segments[1] : segments[0];
  const normalizedSegment = normalizeRouteSegment(routeSegment);

  if (!normalizedSegment) {
    return "api";
  }

  if (ALLOWED_AUDIT_MODULES.has(normalizedSegment as IAuditLog["module"])) {
    return normalizedSegment as IAuditLog["module"];
  }

  return AUDIT_MODULE_ALIASES[normalizedSegment] || "other";
}
