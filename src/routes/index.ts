import type { Express, RequestHandler } from "express";
import {
  earlyRouteModules,
  knownAuthHandlerNames,
  knownAuthMiddleware,
  knownMountLimiters,
  postTamperRouteModules,
  preDocsRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  routeLimiterModules,
} from "./routeModules";
import logger from "../utils/logger";
import { securityBypassPolicy } from "../security/securityPolicy";
import type { SecurityComponent } from "../security/securityPolicy";
import { AUDIT_LOG_ADAPTATION_STATUS, AUDIT_LOG_SOURCE, isBackendApiPath } from "../services/auditLogMetadata";

// Re-export route module phase groups so downstream modules (e.g. app/assembly.ts)
// can register them in pipeline order exactly as before the split.
export {
  earlyRouteModules,
  postTamperRouteModules,
  preDocsRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  routeLimiterModules,
};

export type RouteMetaFlag = boolean | "mixed";
export type RouteModuleKind = "route" | "limiter" | "middleware";
export type RouteModulePhase = "route-limiters" | "pre-parser" | "early" | "pre-docs" | "pre-tamper" | "post-tamper";

export interface RouteAuthPolicy {
  mode: "mount" | "router" | "route" | "mixed";
  handlers: string[];
  note?: string;
}

export interface RouteRateLimitPolicy {
  mode: "mount" | "route-module" | "route" | "router" | "mixed";
  limiters: string[];
  note?: string;
}

export interface RouteAuditLogPolicy {
  enabled: boolean;
  coverage: "all-api-routes" | "not-applicable";
  adaptationStatus: typeof AUDIT_LOG_ADAPTATION_STATUS | "not-applicable";
  source: typeof AUDIT_LOG_SOURCE | "not-applicable";
  note: string;
}

export interface RouteSecurityBypassEntry {
  value: RouteMetaFlag;
  reason: string;
}

export type RouteSecurityBypass = Partial<Record<SecurityComponent, RouteSecurityBypassEntry>>;

export interface OpenCorsException {
  path: string;
  reason: string;
}

export interface RouteGovernanceViolation {
  moduleName: string;
  path: string;
  phase: RouteModulePhase;
  code:
    | "missing-auth-policy"
    | "missing-auth-handlers"
    | "missing-rate-limit-policy"
    | "missing-rate-limit-target"
    | "missing-audit-log-policy"
    | "missing-security-bypass-reason"
    | "security-bypass-inconsistency"
    | "private-route-open-cors-conflict"
    | "auth-middleware-not-found"
    | "rate-limit-not-found"
    | "auth-handler-unknown"
    | "middleware-consistency-violation";
  message: string;
}

export interface RouteAuditRecord {
  name: string;
  path: string;
  phase: RouteModulePhase;
  kind: RouteModuleKind;
  requiresAuth: RouteMetaFlag;
  rateLimited: RouteMetaFlag;
  isPublic: RouteMetaFlag;
  auditLogPolicy: RouteAuditLogPolicy;
  authPolicy?: RouteAuthPolicy;
  rateLimitPolicy?: RouteRateLimitPolicy;
  securityBypass?: RouteSecurityBypass;
  /** Cross-layer: middleware found in the module's middlewares array */
  mountMiddlewareNames?: string[];
  /** Cross-layer: rate limiter modules that scope-overlap this route */
  matchedLimiterModules?: string[];
}

export interface RouteModule {
  name: string;
  path: string;
  router: RequestHandler;
  middlewares?: RequestHandler[];
  kind?: RouteModuleKind;
  requiresAuth: RouteMetaFlag;
  rateLimited: RouteMetaFlag;
  isPublic: RouteMetaFlag;
  authPolicy?: RouteAuthPolicy;
  rateLimitPolicy?: RouteRateLimitPolicy;
  securityBypass?: RouteSecurityBypass;
}

export const NON_API_ROUTE_EXEMPTION_PATHS = [
  "/s",
  "/s/*path",
  "/health",
  "/status",
  "/.well-known/assetlinks.json",
  "/favicon.ico",
] as const;

const API_ROUTE_PREFIX = "/api";
const NON_API_ROUTE_EXEMPTION_SET = new Set<string>(NON_API_ROUTE_EXEMPTION_PATHS);

export const openCorsExceptions: OpenCorsException[] = [
  {
    path: "/api/shorturl/*path",
    reason: "Public short URL resolution and preflight flow",
  },
  {
    path: "/api/turnstile/verify-token",
    reason: "Public Turnstile verification bootstrap",
  },
  {
    path: "/api/turnstile/public-turnstile",
    reason: "Public Turnstile config bootstrap",
  },
] as const;

export function isExemptNonApiRoutePath(routePath: string): boolean {
  return NON_API_ROUTE_EXEMPTION_SET.has(routePath);
}

export function getRouteSecurityBypassFlag(
  module: Pick<RouteModule, "securityBypass">,
  component: SecurityComponent,
): RouteMetaFlag | undefined {
  return module.securityBypass?.[component]?.value;
}

function assertApiRouteModulePath(module: RouteModule): void {
  if (!module.path.startsWith(API_ROUTE_PREFIX) && !isExemptNonApiRoutePath(module.path)) {
    throw new Error(
      `[routes] Route module "${module.name}" must be mounted under ${API_ROUTE_PREFIX} or match an explicit exemption, received "${module.path}"`,
    );
  }
}

function stripWildcardPath(pathname: string): string {
  return pathname.replace(/\/\*.*$/, "");
}

function normalizeScopedPath(pathname: string): string {
  const normalized = stripWildcardPath(pathname).replace(/\/+$/, "");
  return normalized || "/";
}

function pathScopesOverlap(left: string, right: string): boolean {
  const a = normalizeScopedPath(left);
  const b = normalizeScopedPath(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

const routeModuleGroups: Array<{ phase: RouteModulePhase; kind: RouteModuleKind; modules: RouteModule[] }> = [
  { phase: "route-limiters", kind: "limiter", modules: routeLimiterModules },
  { phase: "pre-parser", kind: "route", modules: preParserRouteModules },
  { phase: "early", kind: "route", modules: earlyRouteModules },
  { phase: "pre-docs", kind: "route", modules: preDocsRouteModules },
  { phase: "pre-tamper", kind: "route", modules: preTamperRouteModules },
  { phase: "post-tamper", kind: "route", modules: postTamperRouteModules },
];

/**
 * Validate that auth middleware declared in authPolicy is actually present
 * in the module's middleware chain. This bridges the gap between route
 * registry declarations and the actual Express middleware composition.
 */
function validateAuthMiddlewarePresence(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const isConcreteRoute = record.kind === "route";

  if (!isConcreteRoute || record.requiresAuth !== true || !record.authPolicy) {
    return violations;
  }

  const declaredHandlers = new Set(record.authPolicy.handlers.map((h) => h.toLowerCase()));

  switch (record.authPolicy.mode) {
    case "mount": {
      // For mount mode, auth middleware should be in the module's middlewares array
      const mountHandlers = new Set(
        (module.middlewares || [])
          .map((mw) => knownAuthMiddleware.get(mw))
          .filter(Boolean)
          .map((name) => name!.toLowerCase()),
      );

      for (const declared of declaredHandlers) {
        if (!mountHandlers.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "auth-middleware-not-found",
            message: `Route module "${record.name}" declares authPolicy.mode="mount" with handler "${declared}" but the middleware is not found in the module's middlewares array.`,
          });
        }
      }
      break;
    }
    case "router": {
      // For router mode, verify that the declared handlers are known middleware names.
      // Full router-level validation requires inspecting the router's internal stack,
      // which is done separately via validateRouterMiddlewarePresence().
      const knownHandlerNames = new Set(
        Array.from(knownAuthHandlerNames).map((name) => name.toLowerCase()),
      );

      for (const declared of declaredHandlers) {
        if (!knownHandlerNames.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "auth-handler-unknown",
            message: `Route module "${record.name}" declares authPolicy.mode="router" with handler "${declared}" which is not in the known auth middleware registry.`,
          });
        }
      }
      break;
    }
    case "route": {
      // Route-level auth is harder to validate statically, but we can check
      // that the handler names are at least known.
      const knownHandlerNames = new Set(
        Array.from(knownAuthHandlerNames).map((name) => name.toLowerCase()),
      );

      for (const declared of declaredHandlers) {
        if (!knownHandlerNames.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "auth-handler-unknown",
            message: `Route module "${record.name}" declares authPolicy.mode="route" with handler "${declared}" which is not in the known auth middleware registry.`,
          });
        }
      }
      break;
    }
    case "mixed":
      break;
  }

  return violations;
}

/**
 * Validate that rate limiters declared in rateLimitPolicy are actually present
 * in the module's middleware chain. This verifies that rate limiting declarations
 * match the actual Express middleware composition.
 */
function validateRateLimitApplied(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const isConcreteRoute = record.kind === "route";

  if (!isConcreteRoute || record.rateLimited !== true || !record.rateLimitPolicy) {
    return violations;
  }

  const declaredLimiters = new Set(record.rateLimitPolicy.limiters.map((l) => l.toLowerCase()));

  switch (record.rateLimitPolicy.mode) {
    case "mount": {
      // For mount mode, limiters should be in the module's middlewares array
      const mountLimiters = new Set(
        (module.middlewares || [])
          .map((mw) => knownMountLimiters.get(mw))
          .filter(Boolean)
          .map((name) => name!.toLowerCase()),
      );

      for (const declared of declaredLimiters) {
        if (!mountLimiters.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "rate-limit-not-found",
            message: `Route module "${record.name}" declares rateLimitPolicy.mode="mount" with limiter "${declared}" but it is not found in the module's middlewares array.`,
          });
        }
      }
      break;
    }
    case "route-module": {
      // For route-module mode, the limiter should be registered as a routeLimiterModule
      const declaredLimiterNames = new Set(
        routeLimiterModules.map((lm) => lm.name.toLowerCase()),
      );

      for (const declared of declaredLimiters) {
        if (!declaredLimiterNames.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "rate-limit-not-found",
            message: `Route module "${record.name}" declares rateLimitPolicy.mode="route-module" with limiter "${declared}" but no matching route limiter module is registered.`,
          });
        }
      }
      break;
    }
    case "router":
    case "route":
    case "mixed":
      break;
  }

  return violations;
}

/**
 * Validate that the module's middleware composition is consistent with its
 * declared auth and rate-limit policies. This catches cases where middleware
 * is present in the array but not declared in the policy, or vice versa.
 */
function validateMiddlewareConsistency(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const isConcreteRoute = record.kind === "route";

  if (!isConcreteRoute) {
    return violations;
  }

  // Check for auth middleware in the middlewares array that isn't declared in authPolicy
  if (module.middlewares && module.middlewares.length > 0) {
    const mountAuthHandlers = module.middlewares
      .map((mw) => knownAuthMiddleware.get(mw))
      .filter(Boolean) as string[];

    for (const handlerName of mountAuthHandlers) {
      if (
        record.requiresAuth === true &&
        record.authPolicy &&
        !record.authPolicy.handlers.some((h) => h.toLowerCase() === handlerName.toLowerCase())
      ) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "middleware-consistency-violation",
          message: `Route module "${record.name}" has auth middleware "${handlerName}" in its middlewares array but it is not declared in authPolicy.handlers.`,
        });
      }
    }

    // Check for rate limiters in the middlewares array that aren't declared in rateLimitPolicy
    const mountLimiters = module.middlewares
      .map((mw) => knownMountLimiters.get(mw))
      .filter(Boolean) as string[];

    for (const limiterName of mountLimiters) {
      if (
        record.rateLimited === true &&
        record.rateLimitPolicy &&
        !record.rateLimitPolicy.limiters.some((l) => l.toLowerCase() === limiterName.toLowerCase())
      ) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "middleware-consistency-violation",
          message: `Route module "${record.name}" has rate limiter "${limiterName}" in its middlewares array but it is not declared in rateLimitPolicy.limiters.`,
        });
      }
    }
  }

  return violations;
}

function getModuleKind(module: RouteModule, defaultKind: RouteModuleKind): RouteModuleKind {
  return module.kind || defaultKind;
}

function hasNonEmptyText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function inferRateLimitPolicy(module: RouteModule, kind: RouteModuleKind): RouteRateLimitPolicy | undefined {
  if (kind !== "route") {
    return module.rateLimitPolicy;
  }

  if (module.rateLimitPolicy) {
    return module.rateLimitPolicy;
  }

  if (module.rateLimited !== true) {
    return undefined;
  }

  const mountLimiters = (module.middlewares || [])
    .map((middleware) => knownMountLimiters.get(middleware))
    .filter((value): value is string => Boolean(value));
  if (mountLimiters.length) {
    return {
      mode: "mount",
      limiters: mountLimiters,
      note: "Inferred from mounted limiter middleware declared on the route module.",
    };
  }

  const matchedLimiterModules = routeLimiterModules
    .filter((limiterModule) => pathScopesOverlap(module.path, limiterModule.path))
    .map((limiterModule) => limiterModule.name);
  if (matchedLimiterModules.length) {
    return {
      mode: "route-module",
      limiters: matchedLimiterModules,
      note: "Inferred from dedicated limiter modules mounted earlier in the registry pipeline.",
    };
  }

  return undefined;
}

function inferAuditLogPolicy(module: RouteModule): RouteAuditLogPolicy {
  const routePath = normalizeScopedPath(module.path);

  if (!isBackendApiPath(routePath)) {
    return {
      enabled: false,
      coverage: "not-applicable",
      adaptationStatus: "not-applicable",
      source: "not-applicable",
      note: "Non-API route; global API audit coverage is not applicable.",
    };
  }

  return {
    enabled: true,
    coverage: "all-api-routes",
    adaptationStatus: AUDIT_LOG_ADAPTATION_STATUS,
    source: AUDIT_LOG_SOURCE,
    note: "Covered by the global audit middleware mounted in the preBodyParser security phase before API route modules.",
  };
}

export function getAllRouteAuditRecords(): RouteAuditRecord[] {
  return routeModuleGroups.flatMap(({ phase, kind, modules }) =>
    modules.map((module) => {
      const resolvedKind = getModuleKind(module, kind);

      // Cross-layer: resolve mount middleware names
      const mountMiddlewareNames = (module.middlewares || [])
        .map((mw) => {
          const known = knownAuthMiddleware.get(mw);
          if (known) return known;
          const limiter = knownMountLimiters.get(mw);
          if (limiter) return limiter;
          return undefined;
        })
        .filter(Boolean) as string[];

      // Cross-layer: resolve matched limiter modules
      const matchedLimiterModules = routeLimiterModules
        .filter((limiterModule) => pathScopesOverlap(module.path, limiterModule.path))
        .map((limiterModule) => limiterModule.name);

      return {
        name: module.name,
        path: module.path,
        phase,
        kind: resolvedKind,
        requiresAuth: module.requiresAuth,
        rateLimited: module.rateLimited,
        isPublic: module.isPublic,
        auditLogPolicy: inferAuditLogPolicy(module),
        authPolicy: module.authPolicy,
        rateLimitPolicy: inferRateLimitPolicy(module, resolvedKind),
        securityBypass: module.securityBypass,
        mountMiddlewareNames: mountMiddlewareNames.length > 0 ? mountMiddlewareNames : undefined,
        matchedLimiterModules: matchedLimiterModules.length > 0 ? matchedLimiterModules : undefined,
      };
    }),
  );
}

/**
 * Get all route module definitions (including non-audit limiter/middleware modules)
 * keyed by name for cross-layer validation lookup.
 */
const allRouteModules: RouteModule[] = [
  ...routeLimiterModules,
  ...preParserRouteModules,
  ...earlyRouteModules,
  ...preDocsRouteModules,
  ...preTamperRouteModules,
  ...postTamperRouteModules,
];

function findRouteModule(name: string): RouteModule | undefined {
  return allRouteModules.find((m) => m.name === name);
}

function normalizeRequestPathForBypass(path: string): string | undefined {
  if (!path) {
    return undefined;
  }
  const withoutQuery = path.split("?")[0].split("#")[0];
  const normalized = withoutQuery.replace(/\/+$/, "");
  return normalized || "/";
}

function routeScopeCoversPath(modulePath: string, requestPath: string): boolean {
  const scope = normalizeScopedPath(modulePath);
  return scope === requestPath || requestPath.startsWith(`${scope}/`);
}

/**
 * Resolve the route-module security bypass flag for a request path and
 * component.
 *
 * Route modules are the authoritative source for security bypass declarations.
 * Returns the securityBypass value of the most specific route module whose
 * scope covers `path` and that declares the given component. Returns
 * `undefined` when no covering route module declares the component, so the
 * caller can fall back to the deprecated static policy.
 */
export function getRouteBypassForPath(path: string, component: SecurityComponent): RouteMetaFlag | undefined {
  const requestPath = normalizeRequestPathForBypass(path);
  if (!requestPath) {
    return undefined;
  }

  let bestMatch: { entry: RouteSecurityBypassEntry; scopeLength: number } | undefined;

  for (const module of allRouteModules) {
    const entry = module.securityBypass?.[component];
    if (!entry || entry.value === undefined) {
      continue;
    }
    if (!routeScopeCoversPath(module.path, requestPath)) {
      continue;
    }
    const scopeLength = normalizeScopedPath(module.path).length;
    if (!bestMatch || scopeLength > bestMatch.scopeLength) {
      bestMatch = { entry, scopeLength };
    }
  }

  return bestMatch?.entry.value;
}

/**
 * Detect drift between the deprecated static securityBypassPolicy rules and
 * the authoritative RouteModule.securityBypass declarations. Findings are
 * advisory warnings (code `security-bypass-inconsistency`), not fatal
 * governance violations: the static policy is being retired in favor of route
 * module declarations, so only static rules that lack module coverage are
 * flagged.
 */
function findSecurityBypassInconsistencies(): RouteGovernanceViolation[] {
  const warnings: RouteGovernanceViolation[] = [];

  for (const component of Object.keys(securityBypassPolicy) as SecurityComponent[]) {
    for (const rule of securityBypassPolicy[component]) {
      const rulePath = rule.value.replace(/\/+$/, "");
      const covered = allRouteModules.some((module) => {
        const entry = module.securityBypass?.[component];
        if (!entry || entry.value === undefined) {
          return false;
        }
        return routeScopeCoversPath(module.path, rulePath);
      });

      if (!covered) {
        warnings.push({
          moduleName: "securityPolicy.ts",
          path: rule.value,
          phase: "pre-tamper",
          code: "security-bypass-inconsistency",
          message: `Deprecated static securityBypassPolicy declares a ${component} bypass for "${rule.value}" (${rule.match}) but no RouteModule.securityBypass declaration covers it. RouteModule declarations are the authoritative source; declare this bypass on the owning route module.`,
        });
      }
    }
  }

  return warnings;
}

export function validateRouteGovernance(): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];

  for (const record of getAllRouteAuditRecords()) {
    const isConcreteRoute = record.kind === "route";

    if (isConcreteRoute && record.requiresAuth === true) {
      if (!record.authPolicy) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-auth-policy",
          message: `Route module "${record.name}" requires authentication but does not declare an authPolicy in the route registry.`,
        });
      } else if (!record.authPolicy.handlers.length) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-auth-handlers",
          message: `Route module "${record.name}" requires authentication but authPolicy.handlers is empty.`,
        });
      }
    }

    if (isConcreteRoute && record.rateLimited === true) {
      if (!record.rateLimitPolicy) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-rate-limit-policy",
          message: `Route module "${record.name}" is marked rateLimited=true but does not declare a rateLimitPolicy.`,
        });
      } else if (!record.rateLimitPolicy.limiters.length) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-rate-limit-target",
          message: `Route module "${record.name}" is marked rateLimited=true but rateLimitPolicy.limiters is empty.`,
        });
      }
    }

    if (
      isConcreteRoute &&
      isBackendApiPath(normalizeScopedPath(record.path)) &&
      (!record.auditLogPolicy.enabled || record.auditLogPolicy.adaptationStatus !== AUDIT_LOG_ADAPTATION_STATUS)
    ) {
      violations.push({
        moduleName: record.name,
        path: record.path,
        phase: record.phase,
        code: "missing-audit-log-policy",
        message: `Route module "${record.name}" is an API route but is not marked as completed for audit log coverage.`,
      });
    }

    for (const [component, entry] of Object.entries(record.securityBypass || {})) {
      if (!hasNonEmptyText(entry?.reason)) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-security-bypass-reason",
          message: `Route module "${record.name}" bypasses ${component} without a non-empty reason.`,
        });
      }
    }

    if (isConcreteRoute && record.isPublic === false) {
      for (const exception of openCorsExceptions) {
        if (pathScopesOverlap(record.path, exception.path)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "private-route-open-cors-conflict",
            message: `Route module "${record.name}" is private but overlaps open CORS exception "${exception.path}".`,
          });
        }
      }
    }

    // === Cross-layer validation ===
    if (isConcreteRoute) {
      const module = findRouteModule(record.name);
      if (module) {
        violations.push(
          ...validateAuthMiddlewarePresence(record, module),
          ...validateRateLimitApplied(record, module),
          ...validateMiddlewareConsistency(record, module),
        );
      }
    }
  }

  // Advisory check: legacy static bypass rules must be covered by route module
  // declarations. These are surfaced as warnings (not fatal violations) by
  // assertRouteGovernance().
  violations.push(...findSecurityBypassInconsistencies());

  return violations;
}

export function assertRouteGovernance(): void {
  const violations = validateRouteGovernance();

  // Security bypass inconsistencies are advisory during the static-policy
  // deprecation transition: RouteModule declarations are the authoritative
  // source, so drift between them and the legacy static rules is logged as a
  // warning instead of failing startup.
  const warnings = violations.filter((violation) => violation.code === "security-bypass-inconsistency");
  const fatal = violations.filter((violation) => violation.code !== "security-bypass-inconsistency");

  for (const warning of warnings) {
    logger.warn(
      `[routes] Security bypass inconsistency [${warning.phase}] ${warning.moduleName} (${warning.path}) ${warning.code}: ${warning.message}`,
    );
  }

  if (!fatal.length) {
    return;
  }

  const formatted = fatal
    .map((violation) => `[${violation.phase}] ${violation.moduleName} (${violation.path}) ${violation.code}: ${violation.message}`)
    .join("\n");
  throw new Error(`[routes] Route governance validation failed:\n${formatted}`);
}

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

export function registerRouteModules(app: Express, modules: RouteModule[]): void {
  for (const module of modules) {
    assertApiRouteModulePath(module);
    const middlewares = module.middlewares ?? [];
    app.use(module.path, ...middlewares, module.router);
  }
}
