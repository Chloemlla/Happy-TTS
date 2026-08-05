import crypto from "node:crypto";
import { User, PendingLogin, Session, type IUser } from "../../models/lumen/index.js";
import { lumenConfig } from "../../config/lumen.js";
import { ApiError } from "./errors.js";
import { sendLoginCode } from "./outemail.service.js";
import logger from "../../utils/logger.js";

// ── Tier rank ──────────────────────────────────────────────────────────
const TIER_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  PLUS: 2,
  TEAM: 3,
};

function tierRank(tier: string): number {
  return TIER_RANK[tier] ?? 0;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function generateAccessToken(): string {
  return `lumen_ac_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generateRefreshToken(): string {
  return `lumen_rf_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generateLoginCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Start an email-based login flow.
 *
 * Generates a 6-digit code, persists it in PendingLogin, sends it via
 * outemail, and returns metadata the client needs to complete verification.
 */
export async function startEmailLogin(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw ApiError.badRequest("Invalid email address");
  }

  const code = generateLoginCode();
  const requestId = generateId();
  const expiresAt = Date.now() + lumenConfig.loginCodeTtlSeconds * 1000;

  await PendingLogin.create({
    _id: requestId,
    email: normalized,
    code,
    expiresAt: new Date(expiresAt),
  });

  // Send the code (non-blocking — log and continue on failure).
  let delivery = "email";
  let devCode: string | undefined;

  try {
    await sendLoginCode(normalized, code);
  } catch (error) {
    logger.warn("[Lumen Auth] Failed to send login code via outemail", {
      error: error instanceof Error ? error.message : String(error),
      email: normalized,
    });
    delivery = "failed";
  }

  // If no outemail API key is configured, expose the dev code.
  if (!lumenConfig.outemailApiKey) {
    devCode = lumenConfig.devLoginCode || code;
    delivery = "dev";
  }

  return {
    requestId,
    expiresAt,
    delivery,
    ...(devCode ? { devCode } : {}),
  };
}

/**
 * Verify an email login code.
 *
 * Consumes the PendingLogin, upserts a User, creates a Session, and returns
 * authentication tokens.
 */
export async function verifyEmailLogin(
  email: string,
  requestId: string,
  code: string,
  deviceInstallationId?: string,
) {
  const normalized = email.trim().toLowerCase();

  const pending = await PendingLogin.findById(requestId).exec();
  if (!pending) {
    throw ApiError.notFound("Login request not found or expired");
  }

  if (pending.email !== normalized) {
    throw ApiError.badRequest("Email mismatch");
  }

  if (pending.code !== code) {
    // In dev mode, also accept the dev code.
    if (!lumenConfig.outemailApiKey && code === lumenConfig.devLoginCode) {
      // Accept dev code
    } else {
      throw ApiError.forbidden("Invalid code", "invalid_login_code");
    }
  }

  // Consume the pending login.
  await PendingLogin.deleteOne({ _id: requestId }).exec();

  // Upsert user.
  const now = Date.now();
  const user = await User.findOneAndUpdate(
    { email: normalized },
    {
      $setOnInsert: {
        _id: generateId(),
        email: normalized,
        emailVerified: true,
        createdAt: now,
      },
      $set: {
        updatedAt: now,
        ...(deviceInstallationId ? { deviceInstallationId } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (!user) {
    throw ApiError.internal("Failed to create or find user");
  }

  // Create session.
  const sessionResponse = await createSessionResponse(user._id, deviceInstallationId);

  return {
    ...sessionResponse,
    user: {
      id: user._id,
      email: user.email,
      createdAt: user.createdAt,
      deviceInstallationId: user.deviceInstallationId,
    },
  };
}

/**
 * Refresh an existing session by rotating the refresh token.
 */
export async function refreshSession(
  refreshToken: string,
  deviceInstallationId?: string,
) {
  const oldSession = await Session.findOne({ refreshToken }).exec();
  if (!oldSession) {
    throw ApiError.unauthorized("Refresh token not found");
  }

  if (oldSession.expiresAt <= new Date()) {
    await Session.deleteOne({ _id: oldSession._id }).exec();
    throw ApiError.unauthorized("Refresh token expired");
  }

  // Delete the old session.
  await Session.deleteOne({ _id: oldSession._id }).exec();

  // Optionally update device installation ID.
  if (deviceInstallationId) {
    await User.updateOne(
      { _id: oldSession.userId },
      { $set: { deviceInstallationId, updatedAt: Date.now() } },
    ).exec();
  }

  // Create a new session.
  return createSessionResponse(oldSession.userId, deviceInstallationId || oldSession.deviceInstallationId);
}

/**
 * Create a session with access + refresh tokens.
 */
export async function createSessionResponse(
  userId: string,
  deviceInstallationId?: string,
) {
  const now = Date.now();
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(now + lumenConfig.accessTokenTtlSeconds * 1000);
  const refreshExpiresAt = new Date(now + lumenConfig.refreshTokenTtlSeconds * 1000);

  await Session.create({
    _id: accessToken,
    refreshToken,
    userId,
    deviceInstallationId,
    createdAt: now,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer" as const,
    expiresAt: expiresAt.getTime(),
    refreshExpiresAt: refreshExpiresAt.getTime(),
  };
}

export { tierRank };