import type { Express, RequestHandler } from "express";
import { ipBanCheckWithRateLimit } from "../middleware/ipBanCheck";
import { tamperProtectionMiddleware } from "../middleware/tamperProtection";
import { wafMiddleware } from "../middleware/wafMiddleware";
import { AuditLogService } from "../services/auditLogService";
import type { SecurityComponent } from "./securityPolicy";

export type SecurityPipelinePhase = "preBodyParser" | "postBodyParser" | "prePostTamperRoutes";

export interface SecurityPipelineStep {
  name: string;
  phase: SecurityPipelinePhase;
  component: SecurityComponent | "auditLog";
  description: string;
  middlewares: RequestHandler[];
  enabled?: () => boolean;
}

export const securityPipelineSteps: SecurityPipelineStep[] = [
  {
    name: "ip-ban-check",
    phase: "preBodyParser",
    component: "ipBan",
    description: "Reject banned IPs before business routes execute",
    middlewares: [...ipBanCheckWithRateLimit],
  },
  {
    name: "audit-log",
    phase: "preBodyParser",
    component: "auditLog",
    description: "Capture API audit trail before parser-dependent and pre-parser routes dispatch",
    middlewares: [AuditLogService.globalAuditMiddleware()],
  },
  {
    name: "waf",
    phase: "postBodyParser",
    component: "waf",
    description: "Inspect API requests for suspicious payloads",
    middlewares: [wafMiddleware],
    enabled: () => process.env.WAF_ENABLED !== "false",
  },
  {
    name: "tamper-protection",
    phase: "prePostTamperRoutes",
    component: "tamperProtection",
    description: "Block IPs flagged by tamper detection before protected route groups",
    middlewares: [tamperProtectionMiddleware],
  },
];

export function getSecurityPipelineSteps(phase: SecurityPipelinePhase): SecurityPipelineStep[] {
  return securityPipelineSteps.filter((step) => step.phase === phase);
}

export function registerSecurityPipeline(app: Express, phase: SecurityPipelinePhase): SecurityPipelineStep[] {
  const steps = getSecurityPipelineSteps(phase);

  for (const step of steps) {
    if (step.enabled && !step.enabled()) {
      continue;
    }

    app.use(...step.middlewares);
  }

  return steps;
}
