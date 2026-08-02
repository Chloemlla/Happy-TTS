import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { RouteModule } from "../index";
import { authenticateToken } from "../../middleware/authenticateToken";
import { nexaiRequestSignature } from "../../middleware/nexaiRequestSignature";
import { passkeyAutoFixMiddleware } from "../../middleware/passkeyAutoFix";
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
import cdkRoutes from "../cdkRoutes";
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
import rustBenchmarkRoutes from "../rustBenchmarkRoutes";
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
  },
  {
    name: "libre-chat-routes",
    path: "/api/libre-chat",
    router: libreChatRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "human-check-routes",
    path: "/api/human-check",
    router: humanCheckRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "adminOnly"],
      note: "Public nonce and verification endpoints are open; statistics and trace administration require JWT admin checks.",
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
      mode: "route",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Every admin route composes the guard tuple directly at route level.",
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
  },
  {
    name: "network-routes",
    path: "/api/network",
    router: networkRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "data-process-routes",
    path: "/api/data",
    router: dataProcessRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
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
    name: "lottery-routes",
    path: "/api/lottery",
    router: lotteryRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken"],
      note: "Public lottery read endpoints are open; user participation and administrative mutation routes require JWT authentication.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["lotteryLimiter", "participationLimiter"],
      note: "Lottery routes apply general lottery and stricter participation route-level limiters.",
    },
  },
  {
    name: "media-routes",
    path: "/api/media",
    router: mediaRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
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
      mode: "route",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Public article reads are open; article creation, updates, publishing, and deletion require administrator JWT checks inside the router.",
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
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "life-routes",
    path: "/api/life",
    router: lifeRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "log-routes",
    path: "/api",
    router: logRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken"],
      note: "Share upload/query flows use an admin operation password; list/delete/archive administration requires JWT admin checks inside the router.",
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
    middlewares: [passkeyAutoFixMiddleware],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
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
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
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
  },
  {
    name: "cdk-routes",
    path: "/api/cdks",
    router: cdkRoutes,
    middlewares: [cdkMountLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
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
      mode: "mount",
      handlers: ["authenticateToken"],
      note: "JWT authentication is enforced at mount; route handlers add admin authorization checks.",
    },
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["adminLimiter"],
      note: "Webhook event administration is protected by the admin mount limiter.",
    },
  },
  {
    name: "fbi-wanted-routes",
    path: "/api/fbi-wanted",
    router: fbiWantedRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Public wanted-list reads use /public routes; administrative list and mutation routes require JWT admin checks.",
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
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
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
      handlers: ["authenticateToken"],
      note: "Bilibili UID binding and sync routes use the existing account JWT and derive user scope from the authenticated request.",
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
    name: "rust-benchmark-routes",
    path: "/api/rust-benchmark",
    router: rustBenchmarkRoutes,
    middlewares: [adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken", "adminOnly"],
      note: "Rust benchmark routes are guarded inside the router and are available only to administrators.",
    },
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["adminLimiter"],
      note: "Benchmark start, stop, and status endpoints share the admin limiter at mount time.",
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
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
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
