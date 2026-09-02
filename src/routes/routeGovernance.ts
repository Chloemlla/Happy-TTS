import type { RequestHandler } from "express";
import {
  allRouteModules,
  findRouteModule,
  getModuleScopes,
  isBroadRouteScope,
  normalizeScopedPath,
  openCorsExceptions,
  pathScopesOverlap,
  routeModuleGroups,
  scopeCoversPath,
} from "./index";
import type {
  RouteAuditLogPolicy,
  RouteAuditRecord,
  RouteGovernanceViolation,
  RouteModule,
  RouteModuleKind,
  RouteRateLimitPolicy,
} from "./index";
import {
  knownAuthHandlerNames,
  knownAuthMiddleware,
  knownMountLimiters,
  routeLimiterModules,
} from "./routeModules";
import { matchesSecurityBypassRule, securityBypassPolicy } from "../security/securityPolicy";
import type { SecurityComponent } from "../security/securityPolicy";
import { AUDIT_LOG_ADAPTATION_STATUS, AUDIT_LOG_SOURCE, isBackendApiPath } from "../services/auditLogMetadata";
import logger from "../utils/logger";

/** authPolicy.handlers 允许出现的名字：按名登记的 + 已知函数引用的规范名，两个来源合并。 */
const knownAuthNames = new Set<string>([
  ...Array.from(knownAuthHandlerNames, (name) => name.toLowerCase()),
  ...Array.from(knownAuthMiddleware.values(), (name) => name.toLowerCase()),
]);

function hasNonEmptyText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function getModuleKind(module: RouteModule, defaultKind: RouteModuleKind): RouteModuleKind {
  return module.kind || defaultKind;
}

function violation(
  record: Pick<RouteAuditRecord, "name" | "path" | "phase">,
  code: RouteGovernanceViolation["code"],
  message: string,
): RouteGovernanceViolation {
  return { moduleName: record.name, path: record.path, phase: record.phase, code, message };
}

function collectMountedNames(
  middlewares: RequestHandler[] | undefined,
  known: Map<RequestHandler, string>,
): string[] {
  return (middlewares || [])
    .map((middleware) => known.get(middleware))
    .filter((name): name is string => Boolean(name));
}

function resolveMountedNames(
  middlewares: RequestHandler[] | undefined,
  known: Map<RequestHandler, string>,
): Set<string> {
  return new Set(collectMountedNames(middlewares, known).map((name) => name.toLowerCase()));
}

/**
 * 校验 authPolicy 声明本身是否可信：handler 名必须在已知注册表里，mount 模式必须真的挂了
 * 对应中间件，无法静态核对的 mode 必须写 note 交代鉴权挂在哪一层。
 *
 * 与旧实现的区别：只要声明了 authPolicy 就校验，不再只在 requiresAuth === true 时
 * 才跑——"mixed" 是注册表里最常见的取值，跳过它等于绝大多数条目从未被校验。
 */
function validateAuthPolicyDeclaration(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const policy = module.authPolicy;
  if (!policy) {
    return [];
  }

  const violations: RouteGovernanceViolation[] = [];

  if (!policy.handlers.length) {
    violations.push(
      violation(
        record,
        "missing-auth-handlers",
        `Route module "${record.name}" declares an authPolicy but authPolicy.handlers is empty.`,
      ),
    );
  }

  for (const handler of policy.handlers) {
    if (!knownAuthNames.has(handler.toLowerCase())) {
      violations.push(
        violation(
          record,
          "auth-handler-unknown",
          `Route module "${record.name}" declares authPolicy.mode="${policy.mode}" with handler "${handler}" which is not in the known auth middleware registry.`,
        ),
      );
    }
  }

  if (policy.mode === "mount") {
    const mounted = resolveMountedNames(module.middlewares, knownAuthMiddleware);
    for (const handler of policy.handlers) {
      if (!mounted.has(handler.toLowerCase())) {
        violations.push(
          violation(
            record,
            "auth-middleware-not-found",
            `Route module "${record.name}" declares authPolicy.mode="mount" with handler "${handler}" but the middleware is not found in the module's middlewares array.`,
          ),
        );
      }
    }
    return violations;
  }

  // G1-17: 其余 mode 说的都是"鉴权挂在模块内部"，注册表无法静态核对，过去直接 break 放行。
  // 现在至少强制写 note 交代挂在哪一层。
  if (!hasNonEmptyText(policy.note)) {
    violations.push(
      violation(
        record,
        "policy-mode-mismatch",
        `Route module "${record.name}" declares authPolicy.mode="${policy.mode}", which cannot be verified from the registry, without a note stating where authentication is enforced.`,
      ),
    );
  }

  return violations;
}

/**
 * 校验 rateLimitPolicy 声明本身是否可信。
 *
 * 只看条目自己写的 module.rateLimitPolicy，不看 inferRateLimitPolicy 推出来的那份：
 * 推断按作用域重叠取限流模块名（/api/tts 命中 /api/tts/generate），本来就不保证覆盖。
 */
function validateRateLimitPolicyDeclaration(
  record: RouteAuditRecord,
  module: RouteModule,
): RouteGovernanceViolation[] {
  const policy = module.rateLimitPolicy;
  if (!policy) {
    return [];
  }

  const violations: RouteGovernanceViolation[] = [];

  if (!policy.limiters.length) {
    violations.push(
      violation(
        record,
        "missing-rate-limit-target",
        `Route module "${record.name}" declares a rateLimitPolicy but rateLimitPolicy.limiters is empty.`,
      ),
    );
  }

  if (policy.mode === "mount") {
    const mounted = resolveMountedNames(module.middlewares, knownMountLimiters);
    for (const limiter of policy.limiters) {
      if (!mounted.has(limiter.toLowerCase())) {
        violations.push(
          violation(
            record,
            "rate-limit-not-found",
            `Route module "${record.name}" declares rateLimitPolicy.mode="mount" with limiter "${limiter}" but it is not found in the module's middlewares array.`,
          ),
        );
      }
    }
    return violations;
  }

  if (policy.mode === "route-module") {
    return [...violations, ...validateRouteModuleLimiterCoverage(record, module, policy.limiters)];
  }

  if (!hasNonEmptyText(policy.note)) {
    violations.push(
      violation(
        record,
        "policy-mode-mismatch",
        `Route module "${record.name}" declares rateLimitPolicy.mode="${policy.mode}", which cannot be verified from the registry, without a note stating where the limiter is applied.`,
      ),
    );
  }

  return violations;
}

/**
 * mode="route-module" 声明的是"更早注册的专用限流模块已经覆盖我"，所以限流模块的挂载
 * 路径必须是本模块真实作用域的祖先或相等。过去只校验名字是否注册过，一个挂在别处的
 * 限流模块也算过关。
 */
function validateRouteModuleLimiterCoverage(
  record: RouteAuditRecord,
  module: RouteModule,
  limiters: string[],
): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const scopes = getModuleScopes(module);

  for (const limiter of limiters) {
    const limiterModule = routeLimiterModules.find((entry) => entry.name.toLowerCase() === limiter.toLowerCase());
    if (!limiterModule) {
      violations.push(
        violation(
          record,
          "rate-limit-not-found",
          `Route module "${record.name}" declares rateLimitPolicy.mode="route-module" with limiter "${limiter}" but no matching route limiter module is registered.`,
        ),
      );
      continue;
    }

    if (!scopes.some((scope) => scopeCoversPath(limiterModule.path, scope))) {
      violations.push(
        violation(
          record,
          "policy-mode-mismatch",
          `Route module "${record.name}" declares rateLimitPolicy.mode="route-module" with limiter "${limiter}" mounted at "${limiterModule.path}", which does not cover this module's scope (${scopes.join(", ")}).`,
        ),
      );
    }
  }

  return violations;
}

/**
 * G1-17: 过宽作用域必须显式登记。"/" 与 /api 与所有作用域重叠，放行等于让后面按作用域
 * 做的判定（限流覆盖、开放 CORS 冲突、安全绕过归属）全部自动通过。
 */
function validateRouteScope(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];

  for (const scope of record.scopes) {
    if (isBroadRouteScope(scope)) {
      violations.push(
        violation(
          record,
          "overbroad-route-scope",
          `Route module "${record.name}" governs the over-broad scope "${scope}", which overlaps every other route scope. Declare the sub-paths it actually serves in RouteModule.scopes, or register it in broadScopeRouteExemptions.`,
        ),
      );
    }
  }

  // wafMiddleware 与 ipBanCheck 的绕过表按 mount path 建，mount path 比真实作用域宽时，
  // value:true 会把绕过放大到整个 mount path（/api 上的 true 等于整个 API 面停掉 WAF）。
  const mountScope = normalizeScopedPath(module.path);
  const scopeNarrowsMount = record.scopes.some((scope) => scope !== mountScope);
  if (!isBroadRouteScope(mountScope) && !scopeNarrowsMount) {
    return violations;
  }

  for (const [component, entry] of Object.entries(module.securityBypass || {})) {
    if (entry?.value !== true) {
      continue;
    }
    violations.push(
      violation(
        record,
        "overbroad-security-bypass",
        `Route module "${record.name}" declares a full ${component} bypass while mounted at "${module.path}", which is broader than its governed scope (${record.scopes.join(", ")}); consumers keyed on the mount path would apply the bypass to everything under it. Declare "mixed" here and put the full bypass on the module that owns the sub-path.`,
      ),
    );
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
  if (!module.middlewares?.length) {
    return violations;
  }

  for (const handlerName of collectMountedNames(module.middlewares, knownAuthMiddleware)) {
    if (
      record.requiresAuth === true &&
      record.authPolicy &&
      !record.authPolicy.handlers.some((handler) => handler.toLowerCase() === handlerName.toLowerCase())
    ) {
      violations.push(
        violation(
          record,
          "middleware-consistency-violation",
          `Route module "${record.name}" has auth middleware "${handlerName}" in its middlewares array but it is not declared in authPolicy.handlers.`,
        ),
      );
    }
  }

  for (const limiterName of collectMountedNames(module.middlewares, knownMountLimiters)) {
    if (
      record.rateLimited === true &&
      record.rateLimitPolicy &&
      !record.rateLimitPolicy.limiters.some((limiter) => limiter.toLowerCase() === limiterName.toLowerCase())
    ) {
      violations.push(
        violation(
          record,
          "middleware-consistency-violation",
          `Route module "${record.name}" has rate limiter "${limiterName}" in its middlewares array but it is not declared in rateLimitPolicy.limiters.`,
        ),
      );
    }
  }

  return violations;
}

/**
 * G3-08: 真实栈检查。遍历 router 的 Express 栈（含模块 mount 中间件），
 * 对 strictStackCheck 模块逐端点核对鉴权中间件是否真的挂在 handler 链上，
 * 而不是只校验注册表元数据里的名字。publicEndpoints 中列出的路径视为有意公开，跳过。
 */
export function validateRouterMiddlewarePresence(module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const router = (module.router as unknown) as { stack?: Array<Record<string, any>> } | undefined;
  if (!router || !Array.isArray(router.stack)) {
    return violations;
  }

  const publicPaths = new Set((module.publicEndpoints || []).map((p) => p.replace(/\/+$/, "") || "/"));
  // mount 中间件先于 router 执行，也纳入全局 handler 集合
  const globalHandlers: RequestHandler[] = [...(module.middlewares || [])];
  const routes: Array<{ method: string; path: string; handlers: RequestHandler[] }> = [];

  for (const layer of router.stack) {
    if (!layer || typeof layer !== "object") continue;
    if (layer.route && typeof layer.route === "object") {
      const routePath = String(layer.route.path || "/").replace(/\/+$/, "") || "/";
      const handlers = Array.isArray(layer.route.stack)
        ? (layer.route.stack as Array<{ handle?: RequestHandler }>)
            .map((l) => l.handle)
            .filter((h): h is RequestHandler => typeof h === "function")
        : [];
      const methods = layer.route.methods && typeof layer.route.methods === "object"
        ? Object.keys(layer.route.methods)
        : [];
      for (const method of methods) {
        routes.push({ method: method.toUpperCase(), path: routePath, handlers: [...globalHandlers, ...handlers] });
      }
    } else if (typeof layer.handle === "function") {
      globalHandlers.push(layer.handle);
    }
  }

  const isAuthHandler = (h: RequestHandler): boolean => knownAuthMiddleware.has(h);

  for (const route of routes) {
    if (publicPaths.has(route.path)) continue;
    if (route.handlers.some(isAuthHandler)) continue;
    violations.push({
      moduleName: module.name,
      path: `${route.method} ${module.path}${route.path === "/" ? "" : route.path}`,
      phase: "post-tamper",
      code: "auth-middleware-not-found",
      message: `Route module "${module.name}" endpoint ${route.method} ${module.path}${route.path === "/" ? "" : route.path} is not public but no known auth middleware is present in its Express handler stack.`,
    });
  }

  return violations;
}

/** 按模块真实作用域匹配限流模块；过去按 mount path 匹配，/api 条目会命中全部限流模块。 */
function matchLimiterModules(module: RouteModule): string[] {
  const scopes = getModuleScopes(module);
  return routeLimiterModules
    .filter((limiterModule) => scopes.some((scope) => pathScopesOverlap(scope, limiterModule.path)))
    .map((limiterModule) => limiterModule.name);
}

function inferRateLimitPolicy(module: RouteModule, kind: RouteModuleKind): RouteRateLimitPolicy | undefined {
  if (kind !== "route" || module.rateLimitPolicy) {
    return module.rateLimitPolicy;
  }

  if (module.rateLimited !== true) {
    return undefined;
  }

  const mountLimiters = collectMountedNames(module.middlewares, knownMountLimiters);
  if (mountLimiters.length) {
    return {
      mode: "mount",
      limiters: mountLimiters,
      note: "Inferred from mounted limiter middleware declared on the route module.",
    };
  }

  const matchedLimiterModules = matchLimiterModules(module);
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
  // 按真实作用域判定：lumen 挂在 "/" 但请求路径是 /api/lumen/**，全局审计中间件看的是请求路径。
  if (!getModuleScopes(module).some(isBackendApiPath)) {
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
      const mountMiddlewareNames = [
        ...collectMountedNames(module.middlewares, knownAuthMiddleware),
        ...collectMountedNames(module.middlewares, knownMountLimiters),
      ];
      const matchedLimiterModules = matchLimiterModules(module);

      return {
        name: module.name,
        path: module.path,
        scopes: getModuleScopes(module),
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
 * G1-32: 静态 securityBypassPolicy 与 RouteModule.securityBypass 的双向漂移检查。
 * 两个方向都只产生 advisory 警告（code security-bypass-inconsistency），不参与启动失败。
 *
 * 正向：静态规则没有任何模块声明覆盖 → 迁移没走完，绕过来源仍然只在静态表里。
 * 反向：模块声明了 ipBan 全量绕过但静态表没有对应规则 → ipBanCheck 只从静态表构建白名单，
 * 看不到模块声明，这条绕过实际不生效。
 */
function findSecurityBypassInconsistencies(records: RouteAuditRecord[]): RouteGovernanceViolation[] {
  const warnings: RouteGovernanceViolation[] = [];

  for (const component of Object.keys(securityBypassPolicy) as SecurityComponent[]) {
    for (const rule of securityBypassPolicy[component]) {
      const rulePath = normalizeScopedPath(rule.value);
      const covered = allRouteModules.some((module) => {
        const entry = module.securityBypass?.[component];
        if (!entry || entry.value === undefined) {
          return false;
        }
        return getModuleScopes(module).some((scope) => scopeCoversPath(scope, rulePath));
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

  for (const record of records) {
    if (record.securityBypass?.ipBan?.value !== true) {
      continue;
    }
    for (const scope of record.scopes) {
      if (securityBypassPolicy.ipBan.some((rule) => matchesSecurityBypassRule(scope, rule))) {
        continue;
      }
      warnings.push(
        violation(
          record,
          "security-bypass-inconsistency",
          `Route module "${record.name}" declares an ipBan bypass covering "${scope}" but src/middleware/ipBanCheck.ts builds its whitelist from the static securityBypassPolicy.ipBan table only, so the declaration has no effect there. Add the matching static rule until that consumer reads the route registry.`,
        ),
      );
    }
  }

  return warnings;
}

function validateRouteDeclarations(record: RouteAuditRecord): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];

  if (record.requiresAuth === true) {
    if (!record.authPolicy) {
      violations.push(
        violation(
          record,
          "missing-auth-policy",
          `Route module "${record.name}" requires authentication but does not declare an authPolicy in the route registry.`,
        ),
      );
    } else if (!record.authPolicy.handlers.length) {
      violations.push(
        violation(
          record,
          "missing-auth-handlers",
          `Route module "${record.name}" requires authentication but authPolicy.handlers is empty.`,
        ),
      );
    }
  }

  if (record.rateLimited === true) {
    if (!record.rateLimitPolicy) {
      violations.push(
        violation(
          record,
          "missing-rate-limit-policy",
          `Route module "${record.name}" is marked rateLimited=true but does not declare a rateLimitPolicy.`,
        ),
      );
    } else if (!record.rateLimitPolicy.limiters.length) {
      violations.push(
        violation(
          record,
          "missing-rate-limit-target",
          `Route module "${record.name}" is marked rateLimited=true but rateLimitPolicy.limiters is empty.`,
        ),
      );
    }
  }

  if (
    record.scopes.some(isBackendApiPath) &&
    (!record.auditLogPolicy.enabled || record.auditLogPolicy.adaptationStatus !== AUDIT_LOG_ADAPTATION_STATUS)
  ) {
    violations.push(
      violation(
        record,
        "missing-audit-log-policy",
        `Route module "${record.name}" is an API route but is not marked as completed for audit log coverage.`,
      ),
    );
  }

  return violations;
}

function validateOpenCorsConflicts(record: RouteAuditRecord): RouteGovernanceViolation[] {
  if (record.isPublic !== false) {
    return [];
  }

  // G1-17: 过去这里跳过 mount path 等于 /api 的模块，因为 /api 与每条例外都重叠。
  // 现在判定用的是模块真实作用域，重叠即冲突，不需要也不允许再开这个口子。
  const violations: RouteGovernanceViolation[] = [];
  for (const scope of record.scopes) {
    for (const exception of openCorsExceptions) {
      if (pathScopesOverlap(scope, exception.path)) {
        violations.push(
          violation(
            record,
            "private-route-open-cors-conflict",
            `Route module "${record.name}" is private but scope "${scope}" overlaps open CORS exception "${exception.path}".`,
          ),
        );
      }
    }
  }

  return violations;
}

export function validateRouteGovernance(): RouteGovernanceViolation[] {
  const records = getAllRouteAuditRecords();
  const violations: RouteGovernanceViolation[] = [];

  for (const record of records) {
    for (const [component, entry] of Object.entries(record.securityBypass || {})) {
      if (!hasNonEmptyText(entry?.reason)) {
        violations.push(
          violation(
            record,
            "missing-security-bypass-reason",
            `Route module "${record.name}" bypasses ${component} without a non-empty reason.`,
          ),
        );
      }
    }

    if (record.kind !== "route") {
      continue;
    }

    violations.push(...validateRouteDeclarations(record), ...validateOpenCorsConflicts(record));

    const module = findRouteModule(record.name);
    if (!module) {
      continue;
    }

    violations.push(
      ...validateRouteScope(record, module),
      ...validateAuthPolicyDeclaration(record, module),
      ...validateRateLimitPolicyDeclaration(record, module),
      ...validateMiddlewareConsistency(record, module),
    );
    // G3-08: 显式 opt-in 的真实栈检查（只对人工核对过的模块开启）
    if (module.strictStackCheck) {
      violations.push(...validateRouterMiddlewarePresence(module));
    }
  }

  violations.push(...findSecurityBypassInconsistencies(records));

  return violations;
}

export function assertRouteGovernance(): void {
  const violations = validateRouteGovernance();

  // Security bypass inconsistencies are advisory during the static-policy
  // deprecation transition: RouteModule declarations are the authoritative
  // source, so drift between them and the legacy static rules is logged as a
  // warning instead of failing startup.
  const warnings = violations.filter((candidate) => candidate.code === "security-bypass-inconsistency");
  const fatal = violations.filter((candidate) => candidate.code !== "security-bypass-inconsistency");

  for (const warning of warnings) {
    logger.warn(
      `[routes] Security bypass inconsistency [${warning.phase}] ${warning.moduleName} (${warning.path}) ${warning.code}: ${warning.message}`,
    );
  }

  if (!fatal.length) {
    return;
  }

  const formatted = fatal
    .map((candidate) => `[${candidate.phase}] ${candidate.moduleName} (${candidate.path}) ${candidate.code}: ${candidate.message}`)
    .join("\n");
  throw new Error(`[routes] Route governance validation failed:\n${formatted}`);
}
