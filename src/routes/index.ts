import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { ipVerificationMiddleware } from "../middleware/ipVerification";
import { passkeyAutoFixMiddleware } from "../middleware/passkeyAutoFix";
import {
  adminLimiter,
  antaLimiter,
  authLimiter,
  cdkMountLimiter,
  commandLimiter,
  dataCollectionLimiter,
  dataProcessLimiter,
  deeplxLimiter,
  githubBillingLimiter,
  historyLimiter,
  ipfsLimiter,
  libreChatLimiter,
  lifeLimiter,
  mediaLimiter,
  meEndpointLimiter,
  miniapiLimiter,
  modlistMountLimiter,
  networkLimiter,
  nexaiSecurityLimiter,
  passkeyLimiter,
  socialLimiter,
  statusLimiter,
  tamperLimiter,
  totpLimiter,
  ttsLimiter,
} from "../middleware/routeLimiters";
import adminRoutes from "./adminRoutes";
import antaRoutes from "./antaRoutes";
import apiKeyRoutes from "./apiKeyRoutes";
import auditLogRoutes from "./auditLogRoutes";
import authRoutes from "./authRoutes";
import cdkRoutes from "./cdkRoutes";
import commandRoutes from "./commandRoutes";
import dataCollectionAdminRoutes from "./dataCollectionAdminRoutes";
import dataCollectionRoutes from "./dataCollectionRoutes";
import dataProcessRoutes from "./dataProcessRoutes";
import debugConsoleRoutes from "./debugConsoleRoutes";
import deeplxRoutes from "./deeplxRoutes";
import emailRoutes from "./emailRoutes";
import fbiWantedRoutes from "./fbiWantedRoutes";
import githubBillingRoutes from "./githubBillingRoutes";
import humanCheckRoutes from "./humanCheckRoutes";
import imageDataRoutes from "./imageDataRoutes";
import ipfsRoutes from "./ipfsRoutes";
import ipVerificationRoutes from "./ipVerificationRoutes";
import libreChatRoutes from "./libreChatRoutes";
import lifeRoutes from "./lifeRoutes";
import logRoutes from "./logRoutes";
import lotteryRoutes from "./lotteryRoutes";
import mediaRoutes from "./mediaRoutes";
import miniapiRoutes from "./miniapiRoutes";
import modlistRoutes from "./modlistRoutes";
import networkRoutes from "./networkRoutes";
import nexaiRoutes from "./nexaiRoutes";
import nexaiSecurityRoutes from "./nexaiSecurityRoutes";
import outemailRoutes from "./outemailRoutes";
import passkeyRoutes from "./passkeyRoutes";
import policyRoutes from "./policyRoutes";
import resourceRoutes from "./resourceRoutes";
import socialRoutes from "./socialRoutes";
import statusRouter from "./status";
import tamperRoutes from "./tamperRoutes";
import ticketRoutes from "./ticketRoutes";
import totpRoutes, { totpStatusHandler } from "./totpRoutes";
import ttsRoutes from "./ttsRoutes";
import turnstileRoutes from "./turnstileRoutes";
import webhookEventRoutes from "./webhookEventRoutes";
import webhookRoutes from "./webhookRoutes";
import logger from "../utils/logger";
import type { SecurityComponent } from "../security/securityPolicy";

export type RouteMetaFlag = boolean | "mixed";
export type RouteSecurityBypass = Partial<Record<SecurityComponent, RouteMetaFlag>>;

export interface RouteModule {
  name: string;
  path: string;
  router: RequestHandler;
  middlewares?: RequestHandler[];
  requiresAuth: RouteMetaFlag;
  rateLimited: RouteMetaFlag;
  isPublic: RouteMetaFlag;
  securityBypass?: RouteSecurityBypass;
}

const antaRequestLogger: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  logger.info(`安踏防伪查询请求: ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    productId: req.params?.productId || req.body?.productId || "unknown",
  });
  next();
};

export const routeLimiterModules: RouteModule[] = [
  {
    name: "auth-limiter",
    path: "/api/auth",
    router: authLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "auth-me-limiter",
    path: "/api/auth/me",
    router: meEndpointLimiter,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
  },
  {
    name: "tts-generate-limiter",
    path: "/api/tts/generate",
    router: ttsLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tts-history-limiter",
    path: "/api/tts/history",
    router: historyLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tts-jobs-limiter",
    path: "/api/tts/jobs",
    router: historyLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "totp-limiter",
    path: "/api/totp",
    router: totpLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "passkey-limiter",
    path: "/api/passkey",
    router: passkeyLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tamper-limiter",
    path: "/api/tamper",
    router: tamperLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "command-limiter",
    path: "/api/command",
    router: commandLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "libre-chat-limiter",
    path: "/api/libre-chat",
    router: libreChatLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "data-collection-limiter",
    path: "/api/data-collection",
    router: dataCollectionLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "ipfs-limiter",
    path: "/api/ipfs",
    router: ipfsLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "network-limiter",
    path: "/api/network",
    router: networkLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "data-process-limiter",
    path: "/api/data",
    router: dataProcessLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "deeplx-limiter",
    path: "/api/deeplx",
    router: deeplxLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "media-limiter",
    path: "/api/media",
    router: mediaLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "social-limiter",
    path: "/api/social",
    router: socialLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "life-limiter",
    path: "/api/life",
    router: lifeLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "status-limiter",
    path: "/api/status",
    router: statusLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
];

export const preParserRouteModules: RouteModule[] = [
  {
    name: "webhook-routes",
    path: "/api/webhooks",
    router: webhookRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    securityBypass: {
      waf: true,
    },
  },
  {
    name: "data-collection-routes",
    path: "/api/data-collection",
    router: dataCollectionRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    securityBypass: {
      waf: true,
    },
  },
  {
    name: "root-data-collection-routes",
    path: "/",
    router: dataCollectionRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    securityBypass: {
      waf: "mixed",
    },
  },
];

export const earlyRouteModules: RouteModule[] = [
  {
    name: "email-routes",
    path: "/api/email",
    router: emailRoutes,
    requiresAuth: "mixed",
    rateLimited: "mixed",
    isPublic: "mixed",
  },
  {
    name: "outemail-routes",
    path: "/api/outemail",
    router: outemailRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
];

export const preDocsRouteModules: RouteModule[] = [
  {
    name: "tts-routes",
    path: "/api/tts",
    router: ttsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "librechat-compat-routes",
    path: "/api/librechat",
    router: libreChatRoutes,
    middlewares: [libreChatLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
];

export const preTamperRouteModules: RouteModule[] = [
  {
    name: "ip-verification-routes",
    path: "/api/ip-verification",
    router: ipVerificationRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipVerification: true,
    },
  },
  {
    name: "ip-verification-middleware",
    path: "/api",
    router: ipVerificationMiddleware,
    requiresAuth: false,
    rateLimited: false,
    isPublic: "mixed",
  },
  {
    name: "auth-routes",
    path: "/api/auth",
    router: authRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    securityBypass: {
      waf: "mixed",
      ipVerification: "mixed",
    },
  },
  {
    name: "totp-routes",
    path: "/api/totp",
    router: totpRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "totp-status-route",
    path: "/api/totp/status",
    router: totpStatusHandler as RequestHandler,
    middlewares: [authenticateToken],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
  },
  {
    name: "admin-routes",
    path: "/api/admin",
    router: adminRoutes,
    middlewares: [adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
  },
  {
    name: "admin-audit-log-routes",
    path: "/api/admin/audit-logs",
    router: auditLogRoutes,
    middlewares: [adminLimiter, authenticateToken],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
  },
  {
    name: "api-key-routes",
    path: "/api/apikeys",
    router: apiKeyRoutes,
    requiresAuth: true,
    rateLimited: false,
    isPublic: false,
  },
  {
    name: "status-routes",
    path: "/api/status",
    router: statusRouter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    securityBypass: {
      ipBan: true,
      ipVerification: true,
    },
  },
  {
    name: "turnstile-routes",
    path: "/api/turnstile",
    router: turnstileRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    securityBypass: {
      ipVerification: true,
    },
  },
  {
    name: "policy-routes",
    path: "/api/policy",
    router: policyRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tamper-routes",
    path: "/api/tamper",
    router: tamperRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "ticket-routes",
    path: "/api/tickets",
    router: ticketRoutes,
    requiresAuth: true,
    rateLimited: false,
    isPublic: false,
  },
];

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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipVerification: true,
    },
  },
  {
    name: "debug-console-routes",
    path: "/api/debug-console",
    router: debugConsoleRoutes,
    requiresAuth: "mixed",
    rateLimited: false,
    isPublic: "mixed",
  },
  {
    name: "data-collection-admin-routes",
    path: "/api/data-collection/admin",
    router: dataCollectionAdminRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
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
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "lottery-routes",
    path: "/api/lottery",
    router: lotteryRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
  },
  {
    name: "fbi-wanted-routes",
    path: "/api/fbi-wanted",
    router: fbiWantedRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
    name: "nexai-routes",
    path: "/api/nexai",
    router: nexaiRoutes,
    requiresAuth: "mixed",
    rateLimited: false,
    isPublic: "mixed",
  },
  {
    name: "nexai-security-routes",
    path: "/api/nexai",
    router: nexaiSecurityRoutes,
    middlewares: [nexaiSecurityLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
];

export function registerRouteModules(app: Express, modules: RouteModule[]): void {
  for (const module of modules) {
    const middlewares = module.middlewares ?? [];
    app.use(module.path, ...middlewares, module.router);
  }
}
