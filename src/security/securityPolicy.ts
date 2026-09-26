import type { Request } from "express";

/**
 * 路由绕过标志只能在调用时解析，不能在模块作用域 import：
 *
 * routes/index 会（经 routeGovernance / securityPipeline）反过来拉到本文件，
 * 于是一个 CJS 环：routes/index → securityPolicy → routes/index（尚未初始化完）。
 * 它在生产启动路径上看不出来（求值顺序刚好过关），但在 jest 的模块表里会飘：
 * 环上的 barrel 成员在被读到时还是 undefined，于是 authRoutes 取 `AuthController.register`
 * 直接报 "Cannot read properties of undefined (reading 'register')"，
 * 整套件死在 import 阶段（实际 CI：authController / authCookieSession 等 5 个套件）。
 *
 * 类型单独用 import type（编译期擦除，不产生运行时边），只把这个函数延迟。
 */
type RouteBypassResolver = typeof import("../routes").getRouteBypassForPath;

function resolveRouteBypass(): RouteBypassResolver | null {
  // 不缓存 undefined：万一首次调用正落在环内初始化窗口里，缓存会把破碎状态永久固定下来。
  const loaded: unknown = (require("../routes") as typeof import("../routes")).getRouteBypassForPath;
  return typeof loaded === "function" ? (loaded as RouteBypassResolver) : null;
}

export type SecurityComponent = "ipBan" | "waf" | "ipVerification" | "tamperProtection" | "replayProtection";

export interface SecurityBypassRule {
  match: "exact" | "prefix";
  value: string;
  note: string;
}

/**
 * @deprecated Security bypass policy is deprecated.
 *
 * RouteModule.securityBypass declarations in `src/routes/routeModules/*.ts` are
 * the authoritative source of truth for security bypass behavior. This static
 * table is retained only as a legacy fallback for paths/components that do not
 * have a route module declaration (for example scoped sub-paths covered by a
 * module's `"mixed"` flag). New bypasses must be declared on the owning route
 * module, never added here.
 *
 * Consumers that need per-request decisions should call
 * `shouldBypassSecurityComponentForRequest()` (which prefers route module
 * declarations) instead of reading this table directly. Two consumers still read
 * it directly and therefore do not see route module declarations at all:
 * `src/middleware/ipBanCheck.ts` derives its fast-path whitelist from
 * `securityBypassPolicy.ipBan`, and `src/middleware/wafMiddleware.ts` builds its
 * static exact/prefix fallback sets from `securityBypassPolicy.waf` alongside a
 * module-declaration map keyed on mount paths. Both should be migrated to the
 * route registry as part of the deprecation; until then, removing a rule here is
 * a behavior change even when a route module declares the same bypass.
 *
 * G1-32: `validateRouteGovernance()` compares this table against the route module
 * declarations in both directions and reports drift as an advisory
 * `security-bypass-inconsistency` warning (never a startup failure): a static rule
 * that no module declaration covers, and an `ipBan` module declaration with no
 * static rule behind it (which `ipBanCheck.ts` would silently ignore).
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
 * module declarations in `src/routes/routeModules/*.ts`) when a `Request` object
 * is available.
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
  // 解析不到该函数（只在环内初始化窗口可能发生）时退到下面的静态表，不抛错。
  const resolver = resolveRouteBypass();
  const moduleFlag = resolver ? resolver(pathname, component) : undefined;
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
