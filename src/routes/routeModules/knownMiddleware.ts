import type { RequestHandler } from "express";
import { adminOnly } from "../../middleware/adminOnly";
import { authenticateToken } from "../../middleware/authenticateToken";
import { authenticateAdmin, authMiddleware } from "../../middleware/auth";
import { adminAuthMiddleware, authMiddleware as authMiddlewareV2 } from "../../middleware/authMiddleware";
import { nexaiRequestSignature } from "../../middleware/nexaiRequestSignature";
import {
  adminLimiter,
  antaLimiter,
  authLimiter,
  cdkMountLimiter,
  commandLimiter,
  dataCollectionLimiter,
  dataProcessLimiter,
  deeplxLimiter,
  deeplxPublicLimiter,
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
  oauthLimiter,
  passkeyLimiter,
  socialLimiter,
  statusLimiter,
  tamperLimiter,
  ticketAdminLimiter,
  ticketReadLimiter,
  ticketWriteLimiter,
  totpLimiter,
  ttsLimiter,
} from "../../middleware/routeLimiters";

export const knownMountLimiters = new Map<RequestHandler, string>([
  [adminLimiter, "adminLimiter"],
  [antaLimiter, "antaLimiter"],
  [authLimiter, "authLimiter"],
  [cdkMountLimiter, "cdkMountLimiter"],
  [commandLimiter, "commandLimiter"],
  [dataCollectionLimiter, "dataCollectionLimiter"],
  [dataProcessLimiter, "dataProcessLimiter"],
  [deeplxLimiter, "deeplxLimiter"],
  [deeplxPublicLimiter, "deeplxPublicLimiter"],
  [githubBillingLimiter, "githubBillingLimiter"],
  [historyLimiter, "historyLimiter"],
  [ipfsLimiter, "ipfsLimiter"],
  [libreChatLimiter, "libreChatLimiter"],
  [lifeLimiter, "lifeLimiter"],
  [mediaLimiter, "mediaLimiter"],
  [meEndpointLimiter, "meEndpointLimiter"],
  [miniapiLimiter, "miniapiLimiter"],
  [modlistMountLimiter, "modlistMountLimiter"],
  [networkLimiter, "networkLimiter"],
  [nexaiSecurityLimiter, "nexaiSecurityLimiter"],
  [oauthLimiter, "oauthLimiter"],
  [passkeyLimiter, "passkeyLimiter"],
  [socialLimiter, "socialLimiter"],
  [statusLimiter, "statusLimiter"],
  [tamperLimiter, "tamperLimiter"],
  [ticketAdminLimiter, "ticketAdminLimiter"],
  [ticketReadLimiter, "ticketReadLimiter"],
  [ticketWriteLimiter, "ticketWriteLimiter"],
  [totpLimiter, "totpLimiter"],
  [ttsLimiter, "ttsLimiter"],
]);

/**
 * Known auth middleware function references used for cross-layer validation.
 * Maps a middleware function to its canonical name so the governance system
 * can verify that declared auth handlers are actually present in the module's
 * middleware chain.
 */
export const knownAuthMiddleware = new Map<RequestHandler, string>([
  [authenticateToken, "authenticateToken"],
  [authMiddleware, "authMiddleware"],
  [authMiddlewareV2, "authMiddleware"],
  [adminAuthMiddleware, "adminAuthMiddleware"],
  [authenticateAdmin, "authenticateAdmin"],
  [adminOnly, "adminOnly"],
  [nexaiRequestSignature, "nexaiRequestSignature"],
]);

/**
 * Known auth handler names used in route-level or router-level authPolicy
 * declarations. These are names that appear in the route registry but are
 * implemented in middleware files that may not be directly importable in
 * this module. Any handler name used in authPolicy.handlers must be listed
 * here or be a known function reference in knownAuthMiddleware.
 */
export const knownAuthHandlerNames = new Set([
  "authenticateToken",
  "authMiddleware",
  "adminAuthMiddleware",
  "authenticateAdmin",
  "adminOnly",
  "nexaiAuthRequired",
  "nexaiAuthOptional",
  "nexaiRequestSignature",
  "authenticateEcoCustomer",
  "requireEcoAdmin",
  "verifyEcoEnchantsDownloadToken",
  "oauthTokenAuth",
  "client_secret_basic",
]);
