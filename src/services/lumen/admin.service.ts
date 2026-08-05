import crypto from "node:crypto";
import { AdminSession, AdminActionAudit, User, Entitlement } from "../../models/lumen/index.js";
import { lumenConfig } from "../../config/lumen.js";
import { ApiError } from "./errors.js";
import logger from "../../utils/logger.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function generateAccessToken(): string {
  return `lumen_adm_ac_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generateRefreshToken(): string {
  return `lumen_adm_rf_${crypto.randomUUID().replace(/-/g, "")}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Create an admin session by validating username and password.
 */
export async function createAdminSession(username: string, password: string) {
  if (!username || !password) {
    throw ApiError.badRequest("Username and password are required");
  }

  const expectedUsername = lumenConfig.adminUsername || "admin";
  const expectedPassword = lumenConfig.adminPassword || "";

  if (username !== expectedUsername || !constantTimeEqual(password, expectedPassword)) {
    throw ApiError.unauthorized("Invalid admin credentials");
  }

  const now = Date.now();
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(now + lumenConfig.adminSessionTtlSeconds * 1000);
  const refreshExpiresAt = new Date(now + lumenConfig.adminRefreshTtlSeconds * 1000);

  await AdminSession.create({
    _id: accessToken,
    refreshToken,
    username,
    role: "admin",
    expiresAt,
    refreshExpiresAt,
    createdAt: now,
  });

  logger.info("[Lumen Admin] Admin session created", { username });

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer" as const,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    operator: {
      id: accessToken,
      username,
      role: "admin",
    },
  };
}

/**
 * Refresh an admin session.
 */
export async function refreshAdminSession(refreshToken: string) {
  if (!refreshToken) {
    throw ApiError.badRequest("Refresh token is required");
  }

  const oldSession = await AdminSession.findOne({ refreshToken }).exec();
  if (!oldSession) {
    throw ApiError.unauthorized("Admin refresh token not found");
  }

  if (oldSession.refreshExpiresAt && oldSession.refreshExpiresAt <= new Date()) {
    await AdminSession.deleteOne({ _id: oldSession._id }).exec();
    throw ApiError.unauthorized("Admin refresh token expired");
  }

  // Delete old session.
  await AdminSession.deleteOne({ _id: oldSession._id }).exec();

  // Create new session.
  const now = Date.now();
  const accessToken = generateAccessToken();
  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(now + lumenConfig.adminSessionTtlSeconds * 1000);
  const refreshExpiresAt = new Date(now + lumenConfig.adminRefreshTtlSeconds * 1000);

  await AdminSession.create({
    _id: accessToken,
    refreshToken: newRefreshToken,
    username: oldSession.username,
    role: oldSession.role || "admin",
    expiresAt,
    refreshExpiresAt,
    createdAt: now,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    tokenType: "Bearer" as const,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    operator: {
      id: accessToken,
      username: oldSession.username,
      role: oldSession.role || "admin",
    },
  };
}

/**
 * Resolve an admin operator from a valid session token.
 */
export async function adminOperatorForToken(token: string) {
  const session = await AdminSession.findById(token).lean().exec();
  if (!session) return null;
  if (session.expiresAt && session.expiresAt <= new Date()) {
    await AdminSession.deleteOne({ _id: token }).exec();
    return null;
  }
  return {
    id: session._id,
    username: session.username,
    role: session.role,
    createdAt: session.createdAt,
  };
}

/**
 * Apply an admin action with audit trail.
 */
export async function applyAdminAction(
  operator: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const validActions = [
    "change-plan",
    "revoke-pro",
    "push-template",
    "force-update",
    "save-allowlist",
    "set-silent-vision-policy",
    "set-lifecycle-lock-policy",
  ];

  if (!validActions.includes(action)) {
    throw ApiError.badRequest(`Invalid action: ${action}. Must be one of: ${validActions.join(", ")}`);
  }

  const now = Date.now();

  // Execute the action based on type.
  switch (action) {
    case "change-plan": {
      const { userId, tier } = payload as { userId?: string; tier?: string };
      if (!userId || !tier) {
        throw ApiError.badRequest("Payload must include userId and tier");
      }
      // Upsert a manual entitlement.
      await Entitlement.updateOne(
        { userId, source: "admin_manual" },
        {
          $set: {
            tier,
            status: "active",
            lastVerifiedAt: now,
            rawPayloadJson: JSON.stringify({ operator, action, previousTier: payload.previousTier }),
          },
          $setOnInsert: {
            _id: crypto.randomUUID(),
            userId,
            source: "admin_manual",
            productId: `admin_${tier.toLowerCase()}`,
            purchaseToken: `admin_${crypto.randomUUID()}`,
            purchasedAt: now,
            expiresAt: now + 365 * 24 * 60 * 60 * 1000,
          },
        },
        { upsert: true },
      ).exec();
      logger.info("[Lumen Admin] Plan changed", { userId, tier, operator });
      break;
    }

    case "revoke-pro": {
      const { userId: revokeUserId } = payload as { userId?: string };
      if (!revokeUserId) {
        throw ApiError.badRequest("Payload must include userId");
      }
      await Entitlement.updateMany(
        { userId: revokeUserId, status: "active" },
        { $set: { status: "revoked", lastVerifiedAt: now } },
      ).exec();
      logger.info("[Lumen Admin] PRO revoked", { userId: revokeUserId, operator });
      break;
    }

    case "push-template": {
      // Template push is handled by the calling controller with the admin template model.
      logger.info("[Lumen Admin] Template push recorded", { operator, templateName: payload.name });
      break;
    }

    case "force-update": {
      logger.info("[Lumen Admin] Force update recorded", { operator, payload });
      break;
    }

    case "save-allowlist": {
      logger.info("[Lumen Admin] Allowlist save recorded", { operator, entries: payload.entries });
      break;
    }

    case "set-silent-vision-policy": {
      logger.info("[Lumen Admin] Silent vision policy set", { operator, payload });
      break;
    }

    case "set-lifecycle-lock-policy": {
      logger.info("[Lumen Admin] Lifecycle lock policy set", { operator, payload });
      break;
    }
  }

  // Record the audit trail.
  await AdminActionAudit.create({
    _id: crypto.randomUUID(),
    operator,
    action,
    payload: payload as Record<string, unknown>,
    recordedAt: now,
  });

  return {
    accepted: true,
    action,
    recordedAt: new Date(now).toISOString(),
  };
}