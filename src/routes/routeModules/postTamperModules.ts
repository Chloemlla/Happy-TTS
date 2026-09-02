import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { RouteModule } from "../index";
import { authenticateToken } from "../../middleware/authenticateToken";
import { nexaiRequestSignature } from "../../middleware/nexaiRequestSignature";
import {
  adminLimiter,
  antaLimiter,
  cdkMountLimiter,
  githubBillingLimiter,
  miniapiLimiter,
  modlistMountLimiter,
  nexaiSecurityLimiter,
  statusLimiter,
} from "../../middleware/routeLimiters";
import logger from "../../utils/logger";
import antaRoutes from "../antaRoutes";
import bilibiliSyncRoutes from "../bilibiliSyncRoutes";
import cdictRoutes from "../cdictRoutes";
import cdkRoutes from "../cdkRoutes";
import coinFlipRoutes from "../coinFlipRoutes";
import commandRoutes from "../commandRoutes";
import compatRoutes from "../compatRoutes";
import dataCollectionAdminRoutes from "../dataCollectionAdminRoutes";
import dataProcessRoutes from "../dataProcessRoutes";
import deeplxPublicRoutes from "../deeplxPublicRoutes";
import deeplxRoutes from "../deeplxRoutes";
import diagnosticsRoutes from "../diagnosticsRoutes";
import ecoEnchantsRoutes from "../ecoEnchantsRoutes";
import fbiWantedRoutes from "../fbiWantedRoutes";
import githubBillingRoutes from "../githubBillingRoutes";
import humanCheckRoutes from "../humanCheckRoutes";
import imageDataRoutes from "../imageDataRoutes";
import ipfsRoutes from "../ipfsRoutes";
import ipInfoRoutes from "../ipInfoRoutes";
import lifeRoutes from "../lifeRoutes";
import linuxDoCreditRoutes from "../linuxDoCreditRoutes";
import logRoutes from "../logRoutes";
import lotteryRoutes from "../lotteryRoutes";
import libreChatRoutes from "../libreChatRoutes";
import markdownArticleRoutes from "../markdownArticleRoutes";
import mediaRoutes from "../mediaRoutes";
import miniapiRoutes from "../miniapiRoutes";
import modlistRoutes from "../modlistRoutes";
import networkRoutes from "../networkRoutes";
import nexaiRoutes from "../nexaiRoutes";
import nexaiSecurityRoutes from "../nexaiSecurityRoutes";
import openapiJsonRoutes from "../openapiJsonRoutes";
import passkeyRoutes from "../passkeyRoutes";
import resourceRoutes from "../resourceRoutes";
import socialRoutes from "../socialRoutes";
import webhookEventRoutes from "../webhookEventRoutes";
import { assetLinksRoutes, faviconRoutes } from "../siteMetadataRoutes";

const antaRequestLogger: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  logger.info(`安踏防伪查询请求: ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    productId: req.params?.productId || req.body?.productId || "unknown",
  });
  next();
};

export const postTamperRouteModules: RouteModule[] = [
  {
    name: "command-routes",
    path: "/api/command",
    router: commandRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateSuperAdmin"],
      note: "System command operations require JWT authentication and are gated to superadmin at route level (execute/status included).",
    },
    strictStackCheck: true,
    publicEndpoints: [],
  },
  {
    name: "libre-chat-routes",
    path: "/api/libre-chat",
    router: libreChatRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateAdmin", "authenticateSuperAdmin"],
      note: "LibreChat user-facing APIs are mixed; admin users/providers reads are admin-level while user and provider mutations (including delete-all) are gated to superadmin inside the router.",
    },
  },
  {
    name: "human-check-routes",
    path: "/api/human-check",
    router: humanCheckRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "adminOnly", "authenticateSuperAdmin"],
      note: "Public nonce and verification endpoints are open; statistics and trace reads are admin-level and trace deletion is gated to superadmin.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["humanCheckLimiter", "verifyLimiter", "adminLimiter"],
      note: "Human-check routes apply separate bootstrap, verification, and admin route-level limiters.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Human-check bootstrap must be callable before IP verification has established trust.",
      },
    },
  },
  {
    name: "data-collection-admin-routes",
    path: "/api/data-collection/admin",
    router: dataCollectionAdminRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "Admin reads (stats, list, raw) are admin-level; creation, deletion, batch-delete, and clear-all writes are gated to superadmin at route level.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["dataCollectionLimiter"],
      note: "The admin data-collection router rate-limits each route through its shared guard tuple.",
    },
  },
  {
    name: "ipfs-routes",
    path: "/api/ipfs",
    router: ipfsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateAdmin", "authenticateSuperAdmin"],
      note: "Public upload/download flows are open; settings reads are admin-level and settings writes are gated to superadmin inside the router.",
    },
  },
  {
    name: "network-routes",
    path: "/api/network",
    router: networkRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["apiKeyAuth"],
      note: "Network tools (tcping/ping/speed/portscan/ipquery) require an API Key, OAuth Bearer, or a logged-in session at the router level.",
    },
  },
  {
    name: "data-process-routes",
    path: "/api/data",
    router: dataProcessRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["apiKeyAuth"],
      note: "Data-processing endpoints require an API Key, OAuth Bearer, or a logged-in session at the router level.",
    },
  },
  {
    name: "deeplx-routes",
    path: "/api/deeplx",
    router: deeplxRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken"],
      note: "DeepLX page APIs use a router-wide JWT guard before exposing config or translation actions.",
    },
    strictStackCheck: true,
    publicEndpoints: [],
  },
  {
    name: "deeplx-public-routes",
    path: "/api/public/deeplx",
    router: deeplxPublicRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["deeplx-public-limiter"],
      note: "Public translation API is protected by a dedicated loose limiter.",
    },
  },
  {
    name: "cdict-routes",
    path: "/api/cdict",
    router: cdictRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: [
        "cdict-ingress-limiter",
        "cdict-limiter",
        "cdict-trusted-limiter",
        "cdict-trusted-upstream-limiter",
        "cdict-trusted-upstream-ip-limiter",
      ],
      note: "CDict client proxy (translation, language list, speech) is public; a high per-IP ingress ceiling protects signature classification, unsigned traffic uses the baseline per-IP limiter, and verified official clients move to per-install buckets with extra ceilings on routes that spend upstream credentials.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason:
          "Arbitrary user text submitted for translation or speech legitimately contains semicolons, braces, backslashes, and angle brackets; the payload is forwarded to the upstream gateway and never interpreted locally.",
      },
    },
  },
  {
    name: "lottery-routes",
    path: "/api/lottery",
    router: lotteryRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateSuperAdmin"],
      note: "Public lottery read endpoints are open; user participation requires JWT; administrative round creation is gated to superadmin in the controller.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["lotteryLimiter", "participationLimiter"],
      note: "Lottery routes apply general lottery and stricter participation route-level limiters.",
    },
  },
  {
    name: "coin-flip-routes",
    path: "/api/coin-flip",
    router: coinFlipRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateAdmin", "optionalAuthenticateToken"],
      note: "Coin flip and result lookup are public (optional auth to record the user); admin list/statistics require authenticateAdmin.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["coinFlipLimiter", "coinFlipAdminLimiter"],
      note: "Coin flip routes apply public flip and stricter admin route-level limiters.",
    },
  },
  {
    name: "media-routes",
    path: "/api/media",
    router: mediaRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["apiKeyAuth"],
      note: "Media endpoints require an API Key, OAuth Bearer, or a logged-in session at the router level.",
    },
  },
  {
    name: "markdown-article-routes",
    path: "/api/articles",
    router: markdownArticleRoutes,
    middlewares: [statusLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "Public article reads are open; article creation, updates, publishing, and deletion are gated to superadmin inside the router.",
    },
    rateLimitPolicy: {
      mode: "mixed",
      limiters: ["statusLimiter", "adminLimiter"],
      note: "Public article reads use the status limiter at mount; administrator mutations apply the stricter admin limiter inside the router.",
    },
  },
  {
    name: "social-routes",
    path: "/api/social",
    router: socialRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["apiKeyAuth"],
      note: "Social endpoints require an API Key, OAuth Bearer, or a logged-in session at the router level.",
    },
  },
  {
    name: "life-routes",
    path: "/api/life",
    router: lifeRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["apiKeyAuth"],
      note: "Life-tool endpoints require an API Key, OAuth Bearer, or a logged-in session at the router level.",
    },
  },
  {
    name: "log-routes",
    path: "/api",
    router: logRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateSuperAdmin"],
      note: "Share upload/query flows use an admin operation password; list/delete/archive administration is gated to superadmin inside the router.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["logLimiter"],
      note: "LogShare upload, query, list, delete, and archive routes share a dedicated route-level limiter.",
    },
  },
  {
    name: "passkey-routes",
    path: "/api/passkey",
    router: passkeyRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateSuperAdmin"],
      note: "User passkey credential flows require JWT; bulk repair and credential-ID fix administration is gated to superadmin inside the router.",
    },
  },
  {
    name: "miniapi-routes",
    path: "/api/miniapi",
    router: miniapiRoutes,
    middlewares: [miniapiLimiter],
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "anta-routes",
    path: "/api/anta",
    router: antaRoutes,
    middlewares: [antaLimiter, antaRequestLogger],
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "modlist-routes",
    path: "/api/modlist",
    router: modlistRoutes,
    middlewares: [modlistMountLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateSuperAdmin"],
      note: "Public mod list reads are open (optional auth); all five write operations require a logged-in superadmin and write audit logs; the shared modify-code is kept only as a secondary confirmation.",
    },
    strictStackCheck: true,
    publicEndpoints: ["/", "/json"],
  },
  {
    name: "image-data-routes",
    path: "/api/image-data",
    router: imageDataRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken"],
      note: "Every image-data route composes JWT authentication directly at route level.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["imageDataLimiter"],
      note: "Image-data validation, metadata lookup, and recording routes share a dedicated route-level limiter.",
    },
  },
  {
    name: "resource-routes",
    path: "/api",
    router: resourceRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "Public resource reads are open; stats reads are admin-level and resource CRUD is gated to superadmin at route level.",
    },
  },
  {
    name: "cdk-routes",
    path: "/api/cdks",
    router: cdkRoutes,
    middlewares: [cdkMountLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "CDK redeem requires a logged-in session (role comes from req.user, never the body); listing/stats/export reads are admin-level; create, update, batch-delete, delete-all, and KS import writes are gated to superadmin at route level.",
    },
    strictStackCheck: true,
    publicEndpoints: [],
  },
  {
    name: "webhook-event-routes",
    path: "/api/webhook-events",
    router: webhookEventRoutes,
    middlewares: [authenticateToken, adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "JWT authentication is enforced at mount; event reads are admin-level and bulk-status, bulk-delete, replay, create, update, and delete writes are gated to superadmin at route level.",
    },
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["adminLimiter"],
      note: "Webhook event administration is protected by the admin mount limiter.",
    },
    strictStackCheck: true,
    publicEndpoints: [],
  },
  {
    name: "fbi-wanted-routes",
    path: "/api/fbi-wanted",
    router: fbiWantedRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "Public wanted-list reads use /public routes; admin list reads are admin-level and CRUD/photo mutations are gated to superadmin at route level.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["publicLimiter", "adminLimiter", "uploadPhotoLimiter"],
      note: "FBI wanted routes apply separate public, admin, and photo-upload route-level limiters.",
    },
  },
  {
    name: "github-billing-routes",
    path: "/api/github-billing",
    router: githubBillingRoutes,
    middlewares: [githubBillingLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin", "authenticateSuperAdmin"],
      note: "Billing usage and aggregated-usage reads require admin auth; config reads are admin-level and config/cache system writes are gated to superadmin at route level. The legacy /customers path now redirects to the admin-gated /cache/customers.",
    },
    strictStackCheck: true,
    publicEndpoints: ["/customers"],
  },
  {
    name: "linuxdo-credit-routes",
    path: "/api/linuxdo-credit",
    router: linuxDoCreditRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authMiddleware"],
      note: "Notify endpoints are public for merchant callbacks; recharge/order APIs require JWT.",
    },
    rateLimitPolicy: {
      mode: "router",
      limiters: ["linuxdo-credit-notify", "linuxdo-credit-recharge", "linuxdo-credit-read"],
      note: "LINUX DO Credit routes apply route-level limiters inside the router.",
    },
  },
  {
    name: "ecoenchants-routes",
    path: "/api/ecoenchants",
    router: ecoEnchantsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateEcoCustomer", "requireEcoAdmin", "verifyEcoEnchantsDownloadToken"],
      note: "Public license boot endpoints are open; ops registration enforces signed activation tokens; customer, download, and admin branches enforce EcoEnchants-specific JWT/admin/download-token guards.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: [
        "ecoenchantsLicenseVerify",
        "ecoenchantsLicenseActivate",
        "ecoenchantsLicenseDeactivate",
        "ecoenchantsTelemetryEvents",
        "ecoenchantsCustomerIp",
        "ecoenchantsCustomer",
        "ecoenchantsDownloadIp",
        "ecoenchantsDownload",
        "ecoenchantsAdminIp",
        "ecoenchantsAdmin",
        "ecoenchantsOpsRegister",
      ],
      note: "The EcoEnchants router applies dedicated route-level IP and authenticated-subject limiters for license, telemetry, customer, download, admin, and ops-registration flows.",
    },
  },
  {
    name: "nexai-routes",
    path: "/api/nexai",
    router: nexaiRoutes,
    middlewares: [nexaiRequestSignature],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["nexaiAuthRequired", "nexaiAuthOptional"],
      note: "Public auth and artifact view routes are open or optional; profile, sync, and artifact management routes require NexAI authentication.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: [
        "nexaiAuthLimiter",
        "nexaiLoginLimiter",
        "nexaiRegisterLimiter",
        "nexaiOAuthLimiter",
        "nexaiRefreshLimiter",
        "nexaiProfileLimiter",
        "nexaiSyncLimiter",
        "artifactCreateLimiter",
        "artifactViewLimiter",
        "artifactManageLimiter",
        "releaseManifestLimiter",
      ],
      note: "NexAI routes apply dedicated route-level limiters for auth, OAuth, refresh, profile, sync, release manifests, and artifact flows.",
    },
  },
  {
    name: "bilibili-sync-routes",
    path: "/api/bilibili-sync",
    router: bilibiliSyncRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["oauthTokenAuth", "authenticateToken"],
      note: "Bilibili UID binding and sync routes accept the existing account JWT or a scoped OAuth access token and derive user scope from the authenticated request.",
    },
    rateLimitPolicy: {
      mode: "router",
      limiters: ["bilibiliSyncLimiter"],
      note: "All Bilibili binding and sync operations share the authenticated sync limiter.",
    },
  },
  {
    name: "nexai-security-routes",
    path: "/api/nexai",
    router: nexaiSecurityRoutes,
    middlewares: [nexaiRequestSignature, nexaiSecurityLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "mixed",
      limiters: [
        "nexaiSecurityLimiter",
        "nexaiSecurityReportLimiter",
        "nexaiSecurityStatusLimiter",
        "nexaiSecurityAuthLimiter",
        "nexaiSecurityAdminLimiter",
      ],
      note: "NexAI security routes keep the mount limiter and add route-level createLimiter handlers for CodeQL-visible coverage on auth and admin endpoints.",
    },
  },
  {
    name: "diagnostics-routes",
    path: "/api",
    router: diagnosticsRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["integrityLimiter", "docsTimeoutLimiter", "serverStatusLimiter"],
      note: "Diagnostics and operational endpoints apply dedicated route-level limiters.",
    },
  },
  {
    name: "ip-info-routes",
    path: "/api",
    router: ipInfoRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["ipQueryLimiter", "ipReportLimiter", "ipLocationLimiter"],
      note: "IP query, report, and location endpoints apply dedicated route-level limiters.",
    },
  },
  {
    name: "librechat-compat-api-routes",
    path: "/api",
    router: compatRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["lcCompatLimiter"],
      note: "LibreChat compatibility endpoints apply their dedicated route-level limiter.",
    },
  },
  {
    name: "openapi-json-routes",
    path: "/api",
    router: openapiJsonRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken", "adminOnly"],
      note: "OpenAPI spec endpoints share the API docs gate: admin session (cookie or bearer) in production.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["openapiLimiter"],
      note: "OpenAPI JSON endpoints apply the dedicated route-level OpenAPI limiter.",
    },
  },
  {
    name: "assetlinks-route",
    path: "/.well-known/assetlinks.json",
    router: assetLinksRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
  },
  {
    name: "favicon-route",
    path: "/favicon.ico",
    router: faviconRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
  },
];
