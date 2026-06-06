import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { EcoEnchantsController } from "../controllers/ecoEnchantsController";
import { createLimiter } from "../middleware/routeLimiters";
import {
  ECO_ENCHANTS_PRODUCT_ID,
  verifyEcoEnchantsDownloadToken,
} from "../services/ecoEnchantsService";
import { firstString } from "../utils/httpParam";
import { UserStorage } from "../utils/userStorage";

const router = Router();

function getRequestId(req: Request): string {
  return req.requestId || firstString(req.headers["x-request-id"]) || "unknown";
}

function getRequestIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function hashRateLimitSubject(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function scopedRateLimitKey(scope: string, subject: string): string {
  return `${scope}:${hashRateLimitSubject(subject)}`;
}

function getBodyString(req: Request, field: string): string | undefined {
  if (!req.body || typeof req.body !== "object" || Buffer.isBuffer(req.body)) return undefined;
  const value = (req.body as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bodyRateLimitKey(req: Request, scope: string, field: string): string {
  const bodyValue = getBodyString(req, field);
  const subject = bodyValue ? `${field}:${bodyValue.toLowerCase()}` : `ip:${getRequestIp(req)}`;
  return scopedRateLimitKey(scope, subject);
}

function telemetryRateLimitKey(req: Request): string {
  const headerInstallationId = firstString(req.headers["x-eco-installation-id"]);
  const bodyInstallationId = getBodyString(req, "installationId");
  const subject = headerInstallationId || bodyInstallationId;
  return scopedRateLimitKey(
    "ecoenchants:telemetry:events",
    subject ? `installation:${subject.toLowerCase()}` : `ip:${getRequestIp(req)}`,
  );
}

function authenticatedRateLimitKey(req: Request, scope: string): string {
  const downloadToken = (req as any).ecoEnchantsDownloadToken;
  const user = (req as any).user;
  const subject =
    (downloadToken?.customerId && `customer:${downloadToken.customerId}`) ||
    (downloadToken?.licenseId && `license:${downloadToken.licenseId}`) ||
    (user?.id && `user:${user.id}`) ||
    (user?._id && `user:${user._id}`) ||
    (user?.userId && `user:${user.userId}`) ||
    (user?.username && `user:${user.username}`) ||
    `ip:${getRequestIp(req)}`;
  return scopedRateLimitKey(scope, String(subject));
}

function ecoRateLimitHandler(message: string, retryAfterSeconds: number) {
  return (req: Request, res: Response) => {
    res.status(429).json({
      requestId: getRequestId(req),
      error: {
        code: "rate_limited",
        message,
        docsUrl: "https://docs.example.com/ecoenchants/errors#rate_limited",
        retryAfterSeconds,
      },
    });
  };
}

const licenseVerifyLimiter = createLimiter({
  name: "ecoenchantsLicenseVerify",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 5,
  message: "License verification requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => bodyRateLimitKey(req, "ecoenchants:licenses:verify", "installationId"),
  handler: ecoRateLimitHandler("License verification requests are too frequent, please retry later.", 60),
});

const licenseActivateLimiter = createLimiter({
  name: "ecoenchantsLicenseActivate",
  category: "public-api",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "License activation requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => bodyRateLimitKey(req, "ecoenchants:licenses:activate", "licenseKey"),
  handler: ecoRateLimitHandler("License activation requests are too frequent, please retry later.", 60 * 60),
});

const licenseDeactivateLimiter = createLimiter({
  name: "ecoenchantsLicenseDeactivate",
  category: "public-api",
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  message: "License deactivation requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => bodyRateLimitKey(req, "ecoenchants:licenses:deactivate", "licenseKey"),
  handler: ecoRateLimitHandler("License deactivation requests are too frequent, please retry later.", 24 * 60 * 60),
});

const telemetryEventsLimiter = createLimiter({
  name: "ecoenchantsTelemetryEvents",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 120,
  message: "Telemetry event reports are too frequent, please retry later.",
  keyGenerator: telemetryRateLimitKey,
  handler: ecoRateLimitHandler("Telemetry event reports are too frequent, please retry later.", 60),
});

const customerIpLimiter = createLimiter({
  name: "ecoenchantsCustomerIp",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 60,
  message: "Customer portal requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("Customer portal requests are too frequent, please retry later.", 60),
});

const customerLimiter = createLimiter({
  name: "ecoenchantsCustomer",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 60,
  message: "Customer portal requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => authenticatedRateLimitKey(req, "ecoenchants:customer"),
  handler: ecoRateLimitHandler("Customer portal requests are too frequent, please retry later.", 60),
});

const downloadIpLimiter = createLimiter({
  name: "ecoenchantsDownloadIp",
  category: "public-api",
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Download requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("Download requests are too frequent, please retry later.", 60 * 60),
});

const downloadLimiter = createLimiter({
  name: "ecoenchantsDownload",
  category: "public-api",
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Download requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => authenticatedRateLimitKey(req, "ecoenchants:download"),
  handler: ecoRateLimitHandler("Download requests are too frequent, please retry later.", 60 * 60),
});

const adminIpLimiter = createLimiter({
  name: "ecoenchantsAdminIp",
  category: "admin",
  windowMs: 60 * 1000,
  max: 50,
  message: "Admin requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("Admin requests are too frequent, please retry later.", 60),
});

const adminEcoLimiter = createLimiter({
  name: "ecoenchantsAdmin",
  category: "admin",
  windowMs: 60 * 1000,
  max: 50,
  message: "Admin requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => authenticatedRateLimitKey(req, "ecoenchants:admin"),
  handler: ecoRateLimitHandler("Admin requests are too frequent, please retry later.", 60),
});

const opsRegisterLimiter = createLimiter({
  name: "ecoenchantsOpsRegister",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 20,
  message: "Ops instance registration requests are too frequent, please retry later.",
  keyGenerator: (req: Request) => bodyRateLimitKey(req, "ecoenchants:ops:register", "installationId"),
  handler: ecoRateLimitHandler("Ops instance registration requests are too frequent, please retry later.", 60),
});

function sendAuthError(res: Response, req: Request, statusCode: number, code: string, message: string): void {
  res.status(statusCode).json({
    requestId: getRequestId(req),
    code,
    errorCode: code,
    message,
    error: {
      code,
      message,
      docsUrl: `https://docs.example.com/ecoenchants/errors#${code}`,
      retryAfterSeconds: null,
    },
  });
}

function hasEcoAdminMfa(user: any): boolean {
  return Boolean(
    user?.totpEnabled ||
      user?.mfaEnabled ||
      (user?.passkeyEnabled && Array.isArray(user?.passkeyCredentials) && user.passkeyCredentials.length > 0) ||
      (Array.isArray(user?.passkeyCredentials) && user.passkeyCredentials.length > 0),
  );
}

async function authenticateEcoCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization || "";
    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) {
      sendAuthError(res, req, 401, "unauthorized", "Authorization bearer token is required.");
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret) as any;
    const userId = decoded.userId || decoded.sub;
    if (!userId) {
      sendAuthError(res, req, 401, "unauthorized", "Token does not contain a user ID.");
      return;
    }

    const user = await UserStorage.getUserById(String(userId));
    if (!user) {
      sendAuthError(res, req, 401, "unauthorized", "User was not found.");
      return;
    }
    if ((user as any).accountStatus === "suspended" || (user as any).disabled) {
      sendAuthError(res, req, 403, "account_suspended", "User account is suspended.");
      return;
    }

    (req as any).user = user;
    next();
  } catch {
    sendAuthError(res, req, 401, "unauthorized", "Token is invalid or expired.");
  }
}

async function authenticateEcoDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  const downloadToken =
    firstString(req.headers["x-ecoenchants-download-token"]) || firstString(req.query.downloadToken);
  if (downloadToken) {
    try {
      const payload = verifyEcoEnchantsDownloadToken(downloadToken);
      if (payload.productId && payload.productId !== ECO_ENCHANTS_PRODUCT_ID) {
        sendAuthError(res, req, 403, "download_token_forbidden", "Download token is not valid for this product.");
        return;
      }
      (req as any).ecoEnchantsDownloadToken = payload;
      next();
      return;
    } catch {
      sendAuthError(res, req, 401, "invalid_download_token", "Download token is invalid or expired.");
      return;
    }
  }

  await authenticateEcoCustomer(req, res, next);
}

function requireEcoAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    sendAuthError(res, req, 403, "admin_required", "Admin role is required.");
    return;
  }

  const mfaRequired =
    process.env.NODE_ENV === "production" && process.env.ECOENCHANTS_ADMIN_MFA_REQUIRED !== "false";
  if (mfaRequired && !hasEcoAdminMfa(user)) {
    sendAuthError(res, req, 403, "mfa_required", "Admin MFA is required for EcoEnchants administration.");
    return;
  }

  next();
}

const adminGuards = [adminIpLimiter, authenticateEcoCustomer, requireEcoAdmin, adminEcoLimiter];
const customerGuards = [customerIpLimiter, authenticateEcoCustomer, customerLimiter];

router.get("/health", EcoEnchantsController.health);
router.get("/products/:productId/policy", EcoEnchantsController.productPolicy);

router.post("/licenses/verify", licenseVerifyLimiter, EcoEnchantsController.verifyLicense);
router.post("/licenses/activate", licenseActivateLimiter, EcoEnchantsController.activateLicense);
router.post("/licenses/deactivate", licenseDeactivateLimiter, EcoEnchantsController.deactivateLicense);

router.post("/telemetry/events", telemetryEventsLimiter, EcoEnchantsController.reportRuntimeTelemetryEvents);

router.get("/downloads/latest", downloadIpLimiter, authenticateEcoDownload, downloadLimiter, EcoEnchantsController.latestDownload);

router.get("/me/licenses", ...customerGuards, EcoEnchantsController.myLicenses);
router.get("/me/licenses/:licenseId", ...customerGuards, EcoEnchantsController.myLicenseDetail);
router.post(
  "/me/licenses/:licenseId/activations/:activationId/revoke",
  ...customerGuards,
  EcoEnchantsController.revokeMyActivation,
);
router.post("/me/licenses/:licenseId/key/rotate", ...customerGuards, EcoEnchantsController.rotateMyLicenseKey);
router.get("/me/downloads", ...customerGuards, EcoEnchantsController.myDownloads);

router.post("/ops/instances/register", opsRegisterLimiter, EcoEnchantsController.opsRegisterInstance);
router.get("/ops/instances", ...adminGuards, EcoEnchantsController.opsInstances);
router.get("/ops/instances/:instanceId", ...adminGuards, EcoEnchantsController.opsInstanceDetail);
router.get("/ops/instances/:instanceId/jobs", ...adminGuards, EcoEnchantsController.opsJobs);
router.post("/ops/instances/:instanceId/jobs", ...adminGuards, EcoEnchantsController.opsCreateJob);
router.post("/ops/instances/:instanceId/files/read", ...adminGuards, EcoEnchantsController.opsFileRead);
router.post("/ops/instances/:instanceId/files/write", ...adminGuards, EcoEnchantsController.opsFileWrite);
router.post("/ops/instances/:instanceId/files/delete", ...adminGuards, EcoEnchantsController.opsFileDelete);
router.post("/ops/instances/:instanceId/exports", ...adminGuards, EcoEnchantsController.opsExport);
router.get("/ops/instances/:instanceId/backups", ...adminGuards, EcoEnchantsController.opsBackups);
router.post("/ops/instances/:instanceId/backups", ...adminGuards, EcoEnchantsController.opsCreateBackup);
router.post("/ops/instances/:instanceId/backups/:backupId/restore", ...adminGuards, EcoEnchantsController.opsRestoreBackup);
router.get("/ops/jobs/:jobId", ...adminGuards, EcoEnchantsController.opsJobDetail);
router.get("/ops/policies/commands", ...adminGuards, EcoEnchantsController.opsCommandPolicies);
router.post("/ops/policies/commands", ...adminGuards, EcoEnchantsController.opsUpsertCommandPolicy);
router.get("/ops/audit-logs", ...adminGuards, EcoEnchantsController.opsAuditLogs);

router.post("/admin/products", ...adminGuards, EcoEnchantsController.createProduct);
router.patch("/admin/products/:productId", ...adminGuards, EcoEnchantsController.updateProduct);
router.post("/admin/products/:productId/versions", ...adminGuards, EcoEnchantsController.createReleaseBuild);
router.post("/admin/plans", ...adminGuards, EcoEnchantsController.createPlan);
router.post("/admin/licenses", ...adminGuards, EcoEnchantsController.createLicense);
router.patch("/admin/licenses/:licenseId", ...adminGuards, EcoEnchantsController.updateLicense);
router.post("/admin/licenses/:licenseId/revoke", ...adminGuards, EcoEnchantsController.revokeLicense);
router.get("/admin/audit-logs", ...adminGuards, EcoEnchantsController.adminAuditLogs);
router.get("/admin/risk-events", ...adminGuards, EcoEnchantsController.adminRiskEvents);

const versionedRouter = Router();
versionedRouter.use("/", router);
versionedRouter.use("/v1", router);

export default versionedRouter;
