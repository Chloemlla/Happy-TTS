import type { NextFunction, Request, Response } from "express";
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
  handler: ecoRateLimitHandler("License verification requests are too frequent, please retry later.", 60),
});

const licenseActivateLimiter = createLimiter({
  name: "ecoenchantsLicenseActivate",
  category: "public-api",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "License activation requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("License activation requests are too frequent, please retry later.", 60 * 60),
});

const licenseDeactivateLimiter = createLimiter({
  name: "ecoenchantsLicenseDeactivate",
  category: "public-api",
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  message: "License deactivation requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("License deactivation requests are too frequent, please retry later.", 24 * 60 * 60),
});

const customerLimiter = createLimiter({
  name: "ecoenchantsCustomer",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 60,
  message: "Customer portal requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("Customer portal requests are too frequent, please retry later.", 60),
});

const downloadLimiter = createLimiter({
  name: "ecoenchantsDownload",
  category: "public-api",
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Download requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("Download requests are too frequent, please retry later.", 60 * 60),
});

const adminEcoLimiter = createLimiter({
  name: "ecoenchantsAdmin",
  category: "admin",
  windowMs: 60 * 1000,
  max: 50,
  message: "Admin requests are too frequent, please retry later.",
  handler: ecoRateLimitHandler("Admin requests are too frequent, please retry later.", 60),
});

function sendAuthError(res: Response, req: Request, statusCode: number, code: string, message: string): void {
  res.status(statusCode).json({
    requestId: getRequestId(req),
    error: {
      code,
      message,
      docsUrl: `https://docs.example.com/ecoenchants/errors#${code}`,
      retryAfterSeconds: null,
    },
  });
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
  if (mfaRequired && !user.totpEnabled && !user.mfaEnabled) {
    sendAuthError(res, req, 403, "mfa_required", "Admin MFA is required for EcoEnchants administration.");
    return;
  }

  next();
}

const adminGuards = [adminEcoLimiter, authenticateEcoCustomer, requireEcoAdmin];
const customerGuards = [customerLimiter, authenticateEcoCustomer];

router.get("/health", EcoEnchantsController.health);
router.get("/products/:productId/policy", EcoEnchantsController.productPolicy);

router.post("/licenses/verify", licenseVerifyLimiter, EcoEnchantsController.verifyLicense);
router.post("/licenses/activate", licenseActivateLimiter, EcoEnchantsController.activateLicense);
router.post("/licenses/deactivate", licenseDeactivateLimiter, EcoEnchantsController.deactivateLicense);

router.get("/downloads/latest", downloadLimiter, authenticateEcoDownload, EcoEnchantsController.latestDownload);

router.get("/me/licenses", ...customerGuards, EcoEnchantsController.myLicenses);
router.get("/me/licenses/:licenseId", ...customerGuards, EcoEnchantsController.myLicenseDetail);
router.post(
  "/me/licenses/:licenseId/activations/:activationId/revoke",
  ...customerGuards,
  EcoEnchantsController.revokeMyActivation,
);
router.post("/me/licenses/:licenseId/key/rotate", ...customerGuards, EcoEnchantsController.rotateMyLicenseKey);
router.get("/me/downloads", ...customerGuards, EcoEnchantsController.myDownloads);

router.post("/admin/products", ...adminGuards, EcoEnchantsController.createProduct);
router.patch("/admin/products/:productId", ...adminGuards, EcoEnchantsController.updateProduct);
router.post("/admin/products/:productId/versions", ...adminGuards, EcoEnchantsController.createReleaseBuild);
router.post("/admin/plans", ...adminGuards, EcoEnchantsController.createPlan);
router.post("/admin/licenses", ...adminGuards, EcoEnchantsController.createLicense);
router.patch("/admin/licenses/:licenseId", ...adminGuards, EcoEnchantsController.updateLicense);
router.post("/admin/licenses/:licenseId/revoke", ...adminGuards, EcoEnchantsController.revokeLicense);
router.get("/admin/audit-logs", ...adminGuards, EcoEnchantsController.adminAuditLogs);
router.get("/admin/risk-events", ...adminGuards, EcoEnchantsController.adminRiskEvents);

export default router;
