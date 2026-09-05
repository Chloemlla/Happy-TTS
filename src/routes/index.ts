import type { Express, RequestHandler } from "express";
import {
  earlyRouteModules,
  postTamperRouteModules as registeredPostTamperRouteModules,
  preDocsRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  routeLimiterModules,
} from "./routeModules";
import { lumenRouteModules } from "./lumenRouteModules";
import { qqGuardRouteModules } from "./qqGuardRouteModules";
import type { SecurityComponent } from "../security/securityPolicy";
import { AUDIT_LOG_ADAPTATION_STATUS, AUDIT_LOG_SOURCE } from "../services/auditLogMetadata";

// Re-export route module phase groups so downstream modules (e.g. app/assembly.ts)
// can register them in pipeline order exactly as before the split.
export {
  earlyRouteModules,
  preDocsRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  routeLimiterModules,
};

// 治理校验与审计报告拆到独立模块，index 只保留注册表本身（src/**/*.ts 有 800 行上限）。
export {
  assertRouteGovernance,
  getAllRouteAuditRecords,
  validateRouteGovernance,
  validateRouterMiddlewarePresence,
} from "./routeGovernance";
export { renderCrossLayerComplianceReport, renderRouteAuditMarkdown } from "./routeAuditReport";

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
    | "middleware-consistency-violation"
    | "overbroad-route-scope"
    | "overbroad-security-bypass"
    | "policy-mode-mismatch";
  message: string;
}

export interface RouteAuditRecord {
  name: string;
  path: string;
  /** 治理判定用的真实作用域（见 getModuleScopes），mount path 与之不同时以此为准 */
  scopes: string[];
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
  /**
   * G1-17: mount path 与真实作用域不一致时声明真实作用域（例如 router 自带
   * /api/lumen 前缀因而必须挂在 "/"）。治理检查的作用域重叠、限流覆盖、开放 CORS
   * 冲突判定都以此为准，避免宽 mount path 与所有作用域重叠而被"自动通过"。
   * 注意 mount path 宽于真实作用域时仍不允许声明 value 为 true 的 securityBypass
   * （治理检查 overbroad-security-bypass：整段绕过比模块真正拥有的子树宽）；
   * wafMiddleware 的绕过表已按 getModuleScopes 建，ipBanCheck 只读静态 securityBypassPolicy 表。
   */
  scopes?: string[];
  /**
   * G3-08: 开启真实栈检查。为 true 时，validateRouterMiddlewarePresence 会遍历
   * router 的 Express 栈，逐端点核对至少命中一个已知鉴权中间件（publicEndpoints 除外）。
   * 只对经过人工核对、确认每个端点都用标准鉴权中间件的模块开启。
   */
  strictStackCheck?: boolean;
  /** strictStackCheck 下视为公开、不需要鉴权的端点路径（相对模块 path） */
  publicEndpoints?: string[];
}

export const NON_API_ROUTE_EXEMPTION_PATHS = [
  "/s",
  "/s/*path",
  "/health",
  "/status",
  "/.well-known/assetlinks.json",
  "/favicon.ico",
] as const;

export const API_ROUTE_PREFIX = "/api";
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

export interface BroadScopeRouteExemption {
  /** 该模块在这个过宽 mount path 下真正服务的子路径 */
  owns: string[];
  reason: string;
}

/**
 * G1-17: 挂在 /api（或 "/"）这类过宽 mount path 上的历史模块登记表。
 *
 * 过宽作用域与其它所有作用域都重叠，一旦放行就等于给后续检查开后门：限流按作用域
 * 重叠推断必然命中、开放 CORS 冲突检测必然被跳过。因此过宽模块必须在这里登记它
 * 真正服务的子路径（owns），治理检查一律按 owns 判定；没登记的过宽模块直接判违规。
 *
 * 新模块请直接在注册表条目上写 scopes，不要往这张表里加。
 */
export const broadScopeRouteExemptions: Record<string, BroadScopeRouteExemption> = {
  "root-data-collection-routes": {
    owns: ["/api/collect_data"],
    reason: "dataCollectionRoutes 同时挂在 /api 与 /api/data-collection，根挂载只暴露 /api/collect_data 兼容路径。",
  },
  "log-routes": {
    owns: ["/api/logs", "/api/sharelog"],
    reason: "LogShare 的历史路径分布在 /api/logs 与 /api/sharelog 两棵子树上。",
  },
  "resource-routes": {
    owns: ["/api/resources", "/api/categories"],
    reason: "资源与分类两个历史顶层路径，未收敛到统一前缀下。",
  },
  "diagnostics-routes": {
    owns: ["/api/proxy-test", "/api/timing-test", "/api/report-docs-timeout", "/api/server_status"],
    reason: "诊断端点是客户端硬编码的历史路径，不能改前缀。",
  },
  "ip-info-routes": {
    owns: ["/api/ip", "/api/report-ip", "/api/ip-location"],
    reason: "IP 查询/上报端点是前端与外部脚本硬编码的历史路径。",
  },
  "librechat-compat-api-routes": {
    owns: ["/api/lc", "/api/librechat-image"],
    reason: "LibreChat 兼容端点保留旧短路径供外部调用方使用。",
  },
  "openapi-json-routes": {
    owns: ["/api/openapi.json", "/api/api-docs.json"],
    reason: "OpenAPI 文档路径由 Swagger UI 与外部工具硬编码。",
  },
};

export function isExemptNonApiRoutePath(routePath: string): boolean {
  return NON_API_ROUTE_EXEMPTION_SET.has(routePath);
}

export function getRouteSecurityBypassFlag(
  module: Pick<RouteModule, "securityBypass">,
  component: SecurityComponent,
): RouteMetaFlag | undefined {
  return module.securityBypass?.[component]?.value;
}

function stripWildcardPath(pathname: string): string {
  return pathname.replace(/\/\*.*$/, "");
}

export function normalizeScopedPath(pathname: string): string {
  const normalized = stripWildcardPath(pathname).replace(/\/+$/, "");
  return normalized || "/";
}

export function pathScopesOverlap(left: string, right: string): boolean {
  const a = normalizeScopedPath(left);
  const b = normalizeScopedPath(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** scope 是否覆盖 target：相等或是 target 的祖先前缀（方向敏感，与 overlap 不同）。 */
export function scopeCoversPath(scope: string, target: string): boolean {
  const a = normalizeScopedPath(scope);
  const b = normalizeScopedPath(target);
  return a === b || b.startsWith(`${a}/`);
}

const BROAD_ROUTE_SCOPES = new Set<string>(["/", API_ROUTE_PREFIX]);

/** "/" 与 /api 覆盖整个 API 面，作为路由模块的治理作用域即为过宽。 */
export function isBroadRouteScope(scope: string): boolean {
  return BROAD_ROUTE_SCOPES.has(normalizeScopedPath(scope));
}

/** 模块真实作用域：条目自带 scopes 优先，其次过宽登记表的 owns，最后回落 mount path。 */
export function getModuleScopes(module: Pick<RouteModule, "name" | "path" | "scopes">): string[] {
  const owned = broadScopeRouteExemptions[module.name]?.owns;
  const declared = module.scopes?.length ? module.scopes : owned?.length ? owned : [module.path];
  return declared.map(normalizeScopedPath);
}

// G1-18: lumen 与 crash-sdk 过去在 app.ts 里直接 app.use，绕过了注册表和治理闸门。
// qq-guard 控制通道同样声明为 public（HMAC 机器鉴权），并入 post-tamper 阶段统一注册。
export const postTamperRouteModules: RouteModule[] = [
  ...registeredPostTamperRouteModules,
  ...lumenRouteModules,
  ...qqGuardRouteModules,
];

export const routeModuleGroups: Array<{ phase: RouteModulePhase; kind: RouteModuleKind; modules: RouteModule[] }> = [
  { phase: "route-limiters", kind: "limiter", modules: routeLimiterModules },
  { phase: "pre-parser", kind: "route", modules: preParserRouteModules },
  { phase: "early", kind: "route", modules: earlyRouteModules },
  { phase: "pre-docs", kind: "route", modules: preDocsRouteModules },
  { phase: "pre-tamper", kind: "route", modules: preTamperRouteModules },
  { phase: "post-tamper", kind: "route", modules: postTamperRouteModules },
];

export const allRouteModules: RouteModule[] = routeModuleGroups.flatMap((group) => group.modules);

export function findRouteModule(name: string): RouteModule | undefined {
  return allRouteModules.find((module) => module.name === name);
}

function normalizeRequestPathForBypass(path: string): string | undefined {
  if (!path) {
    return undefined;
  }
  const withoutQuery = path.split("?")[0].split("#")[0];
  const normalized = withoutQuery.replace(/\/+$/, "");
  return normalized || "/";
}

// `component|scope` → declaring entry, built once; first module of a shared scope wins.
const routeBypassScopeMap = new Map<string, RouteSecurityBypassEntry>();
for (const routeModule of allRouteModules) {
  if (!routeModule.securityBypass) continue;
  for (const scope of getModuleScopes(routeModule)) {
    for (const [component, entry] of Object.entries(routeModule.securityBypass)) {
      if (!entry || entry.value === undefined) continue;
      const key = `${component}|${scope}`;
      if (!routeBypassScopeMap.has(key)) routeBypassScopeMap.set(key, entry);
    }
  }
}

/**
 * Resolve the route-module security bypass flag for a request path and component.
 *
 * Returns the securityBypass value of the most specific route module whose scope
 * covers `path` and that declares the given component. Returns `undefined` when
 * no covering route module declares the component, so the caller can fall back
 * to the deprecated static policy.
 */
export function getRouteBypassForPath(path: string, component: SecurityComponent): RouteMetaFlag | undefined {
  const requestPath = normalizeRequestPathForBypass(path);
  if (!requestPath) return undefined;
  let scope = requestPath;
  while (scope) {
    const entry = routeBypassScopeMap.get(`${component}|${scope}`);
    if (entry) return entry.value;
    const slash = scope.lastIndexOf("/");
    if (slash <= 0) break;
    scope = scope.slice(0, slash);
  }
  return undefined;
}

function assertApiRouteModulePath(module: RouteModule): void {
  const invalid = getModuleScopes(module).filter(
    (scope) => !scope.startsWith(API_ROUTE_PREFIX) && !isExemptNonApiRoutePath(scope),
  );
  if (invalid.length) {
    throw new Error(
      `[routes] Route module "${module.name}" must be scoped under ${API_ROUTE_PREFIX} or match an explicit exemption, received "${invalid.join(", ")}"`,
    );
  }
}

export function registerRouteModules(app: Express, modules: RouteModule[]): void {
  for (const module of modules) {
    assertApiRouteModulePath(module);
    const middlewares = module.middlewares ?? [];
    app.use(module.path, ...middlewares, module.router);
  }
}
