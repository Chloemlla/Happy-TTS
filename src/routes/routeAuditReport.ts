import type { RouteAuditRecord, RouteGovernanceViolation } from "./index";

export function renderRouteAuditMarkdown(records: RouteAuditRecord[], violations: RouteGovernanceViolation[] = []): string {
  const lines = [
    "# Route Governance Audit",
    "",
    `Generated route modules: ${records.length}`,
    `Validation violations: ${violations.length}`,
    "",
  ];

  if (violations.length) {
    lines.push("## Validation Findings", "");
    for (const violation of violations) {
      lines.push(`- [${violation.phase}] \`${violation.moduleName}\` \`${violation.path}\`: ${violation.message}`);
    }
    lines.push("");
  }

  lines.push(
    "## Route Registry",
    "",
    "| Name | Phase | Kind | Path | Auth | Rate Limit | Audit Log | Public | Security Bypass | Mount Middleware | Matched Limiters |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const record of records) {
    const bypassSummary = Object.entries(record.securityBypass || {})
      .map(([component, entry]) => `${component}=${entry.value} (${entry.reason})`)
      .join("<br>");
    const authSummary = record.authPolicy
      ? `${record.authPolicy.mode}: ${record.authPolicy.handlers.join(", ")}`
      : "-";
    const rateLimitSummary = record.rateLimitPolicy
      ? `${record.rateLimitPolicy.mode}: ${record.rateLimitPolicy.limiters.join(", ")}`
      : "-";
    const auditLogSummary = `${record.auditLogPolicy.adaptationStatus}<br>${record.auditLogPolicy.coverage}<br>${record.auditLogPolicy.source}`;
    const mountMiddlewareSummary = (record.mountMiddlewareNames || []).join(", ") || "-";
    const matchedLimiterSummary = (record.matchedLimiterModules || []).join(", ") || "-";

    lines.push(
      `| ${record.name} | ${record.phase} | ${record.kind} | \`${record.path}\` | ${String(record.requiresAuth)}<br>${authSummary} | ${String(record.rateLimited)}<br>${rateLimitSummary} | ${auditLogSummary} | ${String(record.isPublic)} | ${bypassSummary || "-"} | ${mountMiddlewareSummary} | ${matchedLimiterSummary} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Generate a cross-layer compliance report focused on auth middleware and
 * rate limiter consistency between route registry declarations and actual
 * Express middleware composition.
 */
export function renderCrossLayerComplianceReport(
  records: RouteAuditRecord[],
  violations: RouteGovernanceViolation[] = [],
): string {
  const crossLayerViolations = violations.filter(
    (v) =>
      v.code === "auth-middleware-not-found" ||
      v.code === "rate-limit-not-found" ||
      v.code === "auth-handler-unknown" ||
      v.code === "middleware-consistency-violation",
  );
  const otherViolations = violations.filter((v) => !crossLayerViolations.includes(v));

  const lines = [
    "# Cross-Layer Compliance Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total route modules | ${records.length} |`,
    `| Cross-layer violations | ${crossLayerViolations.length} |`,
    `| Other violations | ${otherViolations.length} |`,
    `| Auth-required routes | ${records.filter((r) => r.requiresAuth === true).length} |`,
    `| Rate-limited routes | ${records.filter((r) => r.rateLimited === true).length} |`,
    `| Public routes | ${records.filter((r) => r.isPublic === true).length} |`,
    `| Mixed auth routes | ${records.filter((r) => r.requiresAuth === "mixed").length} |`,
    "",
  ];

  if (crossLayerViolations.length) {
    lines.push("## Cross-Layer Violations", "");
    for (const violation of crossLayerViolations) {
      lines.push(`- [${violation.code}] \`${violation.moduleName}\` (\`${violation.path}\`, ${violation.phase}): ${violation.message}`);
    }
    lines.push("");
  }

  if (otherViolations.length) {
    lines.push("## Other Governance Violations", "");
    for (const violation of otherViolations) {
      lines.push(`- [${violation.code}] \`${violation.moduleName}\` (\`${violation.path}\`, ${violation.phase}): ${violation.message}`);
    }
    lines.push("");
  }

  // Auth middleware compliance matrix
  lines.push("## Auth Middleware Compliance", "");
  lines.push("| Module | Phase | requiresAuth | Auth Mode | Declared Handlers | Mount Middleware | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  const authRecords = records.filter((r) => r.kind === "route" && r.requiresAuth !== false);
  for (const record of authRecords) {
    const authMode = record.authPolicy?.mode || "none";
    const declaredHandlers = record.authPolicy?.handlers.join(", ") || "-";
    const mountMiddleware = (record.mountMiddlewareNames || []).join(", ") || "-";

    const hasViolation = crossLayerViolations.some(
      (v) => v.moduleName === record.name && (v.code === "auth-middleware-not-found" || v.code === "auth-handler-unknown" || v.code === "middleware-consistency-violation"),
    );
    const status = hasViolation ? "❌ VIOLATION" : record.requiresAuth === true ? "✅ Compliant" : "⚠️ Mixed";

    lines.push(`| ${record.name} | ${record.phase} | ${String(record.requiresAuth)} | ${authMode} | ${declaredHandlers} | ${mountMiddleware} | ${status} |`);
  }

  lines.push("");

  // Rate limit compliance matrix
  lines.push("## Rate Limit Compliance", "");
  lines.push("| Module | Phase | rateLimited | R-L Mode | Declared Limiters | Mount Limiters | Matched Limiter Modules | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");

  const rateLimitedRecords = records.filter((r) => r.kind === "route" && r.rateLimited !== false);
  for (const record of rateLimitedRecords) {
    const rlMode = record.rateLimitPolicy?.mode || "none";
    const declaredLimiters = record.rateLimitPolicy?.limiters.join(", ") || "-";
    const mountLimiters = (record.mountMiddlewareNames || []).filter((n) => n.endsWith("Limiter")).join(", ") || "-";
    const matchedModules = (record.matchedLimiterModules || []).join(", ") || "-";

    const hasViolation = crossLayerViolations.some(
      (v) => v.moduleName === record.name && (v.code === "rate-limit-not-found" || v.code === "middleware-consistency-violation"),
    );
    const status = hasViolation ? "❌ VIOLATION" : record.rateLimited === true ? "✅ Compliant" : "⚠️ Mixed";

    lines.push(`| ${record.name} | ${record.phase} | ${String(record.rateLimited)} | ${rlMode} | ${declaredLimiters} | ${mountLimiters} | ${matchedModules} | ${status} |`);
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
}

