import type { RouteModule } from "./index";
import crashSdkRoutes from "./crashSdkRoutes.js";
import lumenRouter from "./lumen/index.js";

/**
 * G1-18: 这两个挂载点过去写在 app.ts 里直接 app.use，既不过 registerRouteModules，
 * 也不进治理闸门与安全绕过注册表，等于对治理完全不可见。现在按普通路由模块登记，
 * 由 index.ts 并入 post-tamper 阶段一起注册。
 */
export const lumenRouteModules: RouteModule[] = [
  {
    name: "lumen-routes",
    path: "/",
    // lumenRouter 内部自带 /api/lumen 前缀（含未启用时 503 的 fail-closed 闸门），
    // 只能挂在 "/"；真实作用域用 scopes 声明，治理检查按它判定而不是按根路径。
    scopes: ["/api/lumen"],
    router: lumenRouter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["requireAuth", "requireAdmin", "requireAdminActionOperator"],
      note: "Lumen /auth 引导端点公开；me/devices/entitlements/purchases/sync/backups/telemetry/crash-report 等要求 Bearer 会话；/admin 分支再叠加管理员与操作员校验。",
    },
    rateLimitPolicy: {
      mode: "router",
      limiters: ["lumenLimiter"],
      note: "lumenLimiter 挂在 router 内部的 /api/lumen 挂载点上，对整棵 lumen 子树（含 health）生效。",
    },
  },
  {
    name: "crash-sdk-routes",
    path: "/api/crash-sdk",
    router: crashSdkRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["crashSdkLimiter"],
      note: "匿名上报端点在路由级挂 crashSdkLimiter，recordCrashReport 内部另有按设备限流与 reportId 幂等。",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Anonymous crash-report ingest from the lumen-crash-core SDK; crash payloads contain braces/semicolons.",
      },
      ipVerification: {
        value: true,
        reason: "Anonymous crash-report ingest from the lumen-crash-core SDK; devices have no browser IP-verification context.",
      },
    },
  },
];
