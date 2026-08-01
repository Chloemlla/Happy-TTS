import type { Request } from "express";
import { getRouteBypassForPath } from "../routes";

export type SecurityComponent = "ipBan" | "waf" | "ipVerification" | "tamperProtection" | "replayProtection";

export interface SecurityBypassRule {
  match: "exact" | "prefix";
  value: string;
  note: string;
}

/**
 * @deprecated Security bypass policy is deprecated.
 *
 * RouteModule.securityBypass declarations in `src/routes/index.ts` are the
 * authoritative source of truth for security bypass behavior. This static
 * table is retained only as a legacy fallback for paths/components that do not
 * have a route module declaration (for example scoped sub-paths covered by a
 * module's `"mixed"` flag). New bypasses must be declared on the owning route
 * module, never added here.
 *
 * Consumers that need per-request decisions should call
 * `shouldBypassSecurityComponentForRequest()` (which prefers route module
 * declarations) instead of reading this table directly. Note that
 * `src/middleware/ipBanCheck.ts` still derives its fast-path whitelist from
 * `securityBypassPolicy.ipBan`; that consumer should be migrated to the route
 * registry as part of the deprecation.
 */
export const securityBypassPolicy: Record<SecurityComponent, SecurityBypassRule[]> = {
  ipBan: [
    { match: "exact", value: "/health", note: "Liveness/readiness probe" },
    { match: "exact", value: "/api/health", note: "API health check" },
    { match: "exact", value: "/status", note: "Status endpoint (legacy redirect)" },
    { match: "exact", value: "/api/status", note: "Status endpoint" },
  ],
  waf: [
    { match: "exact", value: "/api/auth/login", note: "Authentication payload compatibility" },
    { match: "exact", value: "/api/auth/register", note: "Authentication payload compatibility" },
    { match: "prefix", value: "/api/webhooks", note: "Raw webhook payload verification" },
    { match: "prefix", value: "/api/ecoenchants/v1/webhooks", note: "Raw EcoEnchants marketplace/payment webhook verification" },
    { match: "prefix", value: "/api/data-collection", note: "Accept non-JSON/browser telemetry payloads" },
  ],
  ipVerification: [
    { match: "prefix", value: "/api/ip-verification", note: "Verification bootstrap endpoint" },
    { match: "prefix", value: "/api/turnstile", note: "Public verification flow" },
    { match: "prefix", value: "/api/human-check", note: "Public human-check bootstrap" },
    { match: "prefix", value: "/api/status", note: "Status endpoint" },
    { match: "exact", value: "/api/frontend-config", note: "Frontend boot config" },
    { match: "prefix", value: "/api/auth/linuxdo/", note: "External auth callback" },
    { match: "prefix", value: "/api/oauth", note: "OAuth third-party authorization and token endpoints" },
    {
      match: "prefix",
      value: "/api/tts/assets",
      note: "Browser audio requests are independently authorized by a scoped, expiring TTS asset token",
    },
  ],
  tamperProtection: [],
  replayProtection: [],
};

export function matchesSecurityBypassRule(pathname: string, rule: SecurityBypassRule): boolean {
  if (rule.match === "exact") {
    return pathname === rule.value;
  }

  const prefix = rule.value.replace(/\/+$/, "");
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * @deprecated Prefer `shouldBypassSecurityComponentForRequest()` (or the route
 * module declarations in `src/routes/index.ts`) when a `Request` object is
 * available.
 *
 * This path-based variant still consults the route module registry first
 * (RouteModule.securityBypass is the authoritative source) and falls back to
 * the deprecated static `securityBypassPolicy` only when no route module
 * declares the component for the path.
 */
export function shouldBypassSecurityComponent(component: SecurityComponent, pathname: string): boolean {
  return shouldBypassSecurityComponentForPath(component, pathname);
}

function shouldBypassSecurityComponentForPath(component: SecurityComponent, pathname: string): boolean {
  // RouteModule declarations take precedence over the legacy static rules.
  const moduleFlag = getRouteBypassForPath(pathname, component);
  if (moduleFlag === true) {
    return true;
  }
  if (moduleFlag === false) {
    return false;
  }

  // "mixed" or undeclared → fall back to the deprecated static rules.
  const rules = securityBypassPolicy[component];
  return rules.some((rule) => matchesSecurityBypassRule(pathname, rule));
}

/**
 * Determine whether a request bypasses the given security component.
 *
 * RouteModule.securityBypass declarations (resolved through the route registry)
 * are checked first and take precedence over the deprecated static
 * `securityBypassPolicy`.
 */
export function shouldBypassSecurityComponentForRequest(component: SecurityComponent, req: Request): boolean {
  const pathname = req.path || req.originalUrl || req.url || "";
  return shouldBypassSecurityComponentForPath(component, pathname);
}
