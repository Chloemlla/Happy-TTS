import type { Request } from "express";

export type SecurityComponent = "ipBan" | "waf" | "ipVerification" | "tamperProtection" | "replayProtection";

export interface SecurityBypassRule {
  match: "exact" | "prefix";
  value: string;
  note: string;
}

export const securityBypassPolicy: Record<SecurityComponent, SecurityBypassRule[]> = {
  ipBan: [
    { match: "exact", value: "/health", note: "Liveness/readiness probe" },
    { match: "exact", value: "/api/health", note: "API health check" },
    { match: "exact", value: "/status", note: "Status endpoint" },
    { match: "exact", value: "/api/status", note: "Status endpoint" },
  ],
  waf: [
    { match: "exact", value: "/api/auth/login", note: "Authentication payload compatibility" },
    { match: "exact", value: "/api/auth/register", note: "Authentication payload compatibility" },
    { match: "prefix", value: "/api/webhooks", note: "Raw webhook payload verification" },
    { match: "prefix", value: "/api/data-collection", note: "Accept non-JSON/browser telemetry payloads" },
  ],
  ipVerification: [
    { match: "prefix", value: "/api/ip-verification", note: "Verification bootstrap endpoint" },
    { match: "prefix", value: "/api/turnstile", note: "Public verification flow" },
    { match: "prefix", value: "/api/human-check", note: "Public human-check bootstrap" },
    { match: "prefix", value: "/api/status", note: "Status endpoint" },
    { match: "exact", value: "/api/frontend-config", note: "Frontend boot config" },
    { match: "prefix", value: "/api/auth/linuxdo/", note: "External auth callback" },
  ],
  tamperProtection: [],
  replayProtection: [],
};

export function matchesSecurityBypassRule(pathname: string, rule: SecurityBypassRule): boolean {
  if (rule.match === "exact") {
    return pathname === rule.value;
  }

  return pathname === rule.value || pathname.startsWith(`${rule.value}/`);
}

export function shouldBypassSecurityComponent(component: SecurityComponent, pathname: string): boolean {
  const rules = securityBypassPolicy[component];
  return rules.some((rule) => matchesSecurityBypassRule(pathname, rule));
}

export function shouldBypassSecurityComponentForRequest(component: SecurityComponent, req: Request): boolean {
  const pathname = req.path || req.originalUrl || req.url || "";
  return shouldBypassSecurityComponent(component, pathname);
}
