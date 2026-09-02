import type { RouteModule } from "../index";
import dataCollectionRoutes from "../dataCollectionRoutes";
import ecoEnchantsWebhookRoutes from "../ecoEnchantsWebhookRoutes";
import healthRoutes from "../healthRoutes";
import { legacyApiRedirectMiddleware } from "../legacyApiRedirect";
import webhookRoutes from "../webhookRoutes";

export const preParserRouteModules: RouteModule[] = [
  {
    name: "health-route",
    path: "/health",
    router: healthRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipBan: {
        value: true,
        reason: "Liveness/readiness probes must remain available while ban infrastructure is active.",
      },
    },
  },
  {
    name: "api-health-route",
    path: "/api/health",
    router: healthRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipBan: {
        value: true,
        reason: "Canonical API health checks must remain available while ban infrastructure is active.",
      },
    },
  },
  {
    name: "webhook-routes",
    path: "/api/webhooks",
    router: webhookRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["webhookLimiter"],
      note: "Webhook routes apply a dedicated route-level limiter inside the router.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Webhook signature verification requires raw payload compatibility before WAF normalization.",
      },
    },
  },
  {
    name: "ecoenchants-webhook-routes",
    path: "/api/ecoenchants/v1/webhooks",
    router: ecoEnchantsWebhookRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["ecoenchantsWebhook"],
      note: "Payment and marketplace webhooks apply a route-level limiter and verify provider signatures from raw payloads.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Webhook signature verification requires raw payload compatibility before WAF normalization.",
      },
    },
  },
  {
    name: "data-collection-routes",
    path: "/api/data-collection",
    router: dataCollectionRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["data-collection-limiter"],
      note: "Ingress is protected by the dedicated /api/data-collection limiter mount.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Telemetry ingestion accepts browser-originated payloads that the WAF would over-block.",
      },
    },
  },
  {
    name: "root-data-collection-routes",
    path: "/api",
    router: dataCollectionRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["dataCollectionLimiter"],
      note: "根挂载只暴露 /api/collect_data，限流来自 dataCollectionRoutes.ts 里路由级的 dataCollectionLimiter；挂在 /api/data-collection 的限流模块管不到这条兼容路径。",
    },
    securityBypass: {
      waf: {
        value: "mixed",
        reason: "Only the data-collection branch under /api should bypass WAF; sibling routes remain protected.",
      },
    },
  },
  {
    name: "legacy-status-route",
    path: "/status",
    router: legacyApiRedirectMiddleware,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipBan: {
        value: true,
        reason: "Legacy /status redirect must remain reachable while IP ban infrastructure is active.",
      },
    },
  },
];
