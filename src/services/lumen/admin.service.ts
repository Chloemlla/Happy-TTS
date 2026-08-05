import crypto from "node:crypto";
import { AdminSession, AdminActionAudit, User, Entitlement, AdminTemplate, AdminRelease, AdminSecurityAllowlist, DeviceControlPolicy } from "../../models/lumen/index.js";
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
    expiresAt: expiresAt.getTime(),
    refreshExpiresAt: refreshExpiresAt.getTime(),
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
    expiresAt: expiresAt.getTime(),
    refreshExpiresAt: refreshExpiresAt.getTime(),
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
        { userId, source: "admin" },
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
            source: "admin",
            productId: (payload.productId as string) || `admin_${tier.toLowerCase()}`,
            purchaseToken: "",
            purchasedAt: now,
            expiresAt: (payload.expiresAt as number) || 0,
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
        { userId: revokeUserId, tier: { $in: ["PRO", "PLUS", "TEAM", "DEVELOPER"] } },
        { $set: { status: "revoked", lastVerifiedAt: now } },
      ).exec();
      logger.info("[Lumen Admin] PRO revoked", { userId: revokeUserId, operator });
      break;
    }

    case "push-template": {
      const id = (payload.id as string) || crypto.randomUUID();
      const record = {
        _id: id,
        name: (payload.name as string) || "Admin template",
        tier: (payload.tier as string) || "PRO",
        countdownStyle: (payload.countdownStyle as string) || "circle",
        color: (payload.color as string) || "#2563EB",
        locales: (Array.isArray(payload.locales) ? payload.locales : ["en", "zh"]) as string[],
        layoutJson: payload.layoutJson || {},
        updatedAt: now,
      };
      await AdminTemplate.findOneAndUpdate(
        { _id: id },
        { $set: record },
        { upsert: true, new: true },
      ).exec();
      logger.info("[Lumen Admin] Template push", { operator, name: record.name });
      break;
    }

    case "force-update": {
      const versionCode = (payload.versionCode as number) || 0;
      const id = (payload.id as string) || `version-${versionCode}`;
      const assets = releaseAssetsFromPayload(payload);
      const patches = releasePatchesFromPayload(payload);
      const legacySha256 = (payload.sha256 as string) || assets[0]?.sha256 || "pending";
      const record = {
        _id: id,
        versionCode,
        versionName: (payload.versionName as string) || "admin-policy",
        channel: (payload.channel as string) || "stable",
        releaseUrl: (payload.releaseUrl as string) || "",
        sha256: legacySha256,
        assets,
        patches,
        rollout: (payload.rollout as string) || "blocked",
        forceUpdate: payload.forceUpdate !== undefined ? Boolean(payload.forceUpdate) : true,
        createdAt: now,
      };
      await AdminRelease.findOneAndUpdate(
        { _id: id },
        { $set: record },
        { upsert: true, new: true },
      ).exec();
      logger.info("[Lumen Admin] Force update", { operator, versionCode });
      break;
    }

    case "save-allowlist": {
      const origin = payload.origin as string;
      if (!origin) {
        throw ApiError.badRequest("Payload must include origin");
      }
      const protocol = (payload.protocol as string) || "https";
      const id = `${origin}-${protocol}`;
      await AdminSecurityAllowlist.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            _id: id,
            origin,
            protocol,
            risk: (payload.risk as string) || "required",
            updatedAt: now,
          },
        },
        { upsert: true, new: true },
      ).exec();
      logger.info("[Lumen Admin] Allowlist save", { operator, origin });
      break;
    }

    case "set-silent-vision-policy": {
      // Read current global policy for partial merge.
      const currentPolicy = await DeviceControlPolicy.findOne({ scope: "global" }).lean();
      const baseSilentVision = currentPolicy?.silentVision || {
        enabled: false,
        exclusiveAccess: false,
        noSurfacePreview: false,
        analyzerOnly: true,
        requiresExplicitConsent: true,
        maxFps: 2,
        maxSessionMinutes: 120,
        frameUploadEnabled: false,
        surfaceAnalysisUploadEnabled: false,
        endpointPrefix: "/api/lumen/device-control",
      };
      const mergedSilentVision = {
        ...baseSilentVision,
        ...(payload.enabled !== undefined ? { enabled: Boolean(payload.enabled) } : {}),
        ...(payload.exclusiveAccess !== undefined ? { exclusiveAccess: Boolean(payload.exclusiveAccess) } : {}),
        ...(payload.noSurfacePreview !== undefined ? { noSurfacePreview: Boolean(payload.noSurfacePreview) } : {}),
        ...(payload.analyzerOnly !== undefined ? { analyzerOnly: Boolean(payload.analyzerOnly) } : {}),
        ...(payload.requiresExplicitConsent !== undefined ? { requiresExplicitConsent: Boolean(payload.requiresExplicitConsent) } : {}),
        ...(payload.maxFps !== undefined ? { maxFps: Math.max(1, Math.min(30, Number(payload.maxFps))) } : {}),
        ...(payload.maxSessionMinutes !== undefined ? { maxSessionMinutes: Math.max(1, Math.min(1440, Number(payload.maxSessionMinutes))) } : {}),
        ...(payload.frameUploadEnabled !== undefined ? { frameUploadEnabled: Boolean(payload.frameUploadEnabled) } : {}),
        ...(payload.surfaceAnalysisUploadEnabled !== undefined ? { surfaceAnalysisUploadEnabled: Boolean(payload.surfaceAnalysisUploadEnabled) } : {}),
      };
      const scope = (payload.scope as string) || "global";
      const userId = payload.userId as string | undefined;
      const deviceInstallationId = payload.deviceInstallationId as string | undefined;
      const filter: Record<string, unknown> = { scope };
      if (scope === "device") filter.deviceInstallationId = deviceInstallationId;
      if (scope === "user") filter.userId = userId;
      const baseLifecycleLock = currentPolicy?.lifecycleLock || {
        enabled: false,
        enforceKeepalive: false,
        selfHealOnKill: false,
        interceptUserStop: false,
        antiUninstallIntent: false,
        restartDelayMs: 0,
        maxRestartBurst: 3,
        reportEvents: true,
        endpointPrefix: "/api/lumen/device-control",
      };
      await DeviceControlPolicy.findOneAndUpdate(
        filter,
        {
          $set: {
            scope,
            ...(userId ? { userId } : {}),
            ...(deviceInstallationId ? { deviceInstallationId } : {}),
            silentVision: mergedSilentVision,
            lifecycleLock: baseLifecycleLock,
            updatedAt: now,
            updatedBy: "admin",
          },
          $setOnInsert: { _id: crypto.randomUUID() },
        },
        { upsert: true, new: true },
      ).exec();
      logger.info("[Lumen Admin] Silent vision policy set", { operator, scope });
      break;
    }

    case "set-lifecycle-lock-policy": {
      // Read current global policy for partial merge.
      const currentLifecyclePolicy = await DeviceControlPolicy.findOne({ scope: "global" }).lean();
      const baseLifecycleLock = currentLifecyclePolicy?.lifecycleLock || {
        enabled: false,
        enforceKeepalive: false,
        selfHealOnKill: false,
        interceptUserStop: false,
        antiUninstallIntent: false,
        restartDelayMs: 0,
        maxRestartBurst: 3,
        reportEvents: true,
        endpointPrefix: "/api/lumen/device-control",
      };
      const mergedLifecycleLock = {
        ...baseLifecycleLock,
        ...(payload.enabled !== undefined ? { enabled: Boolean(payload.enabled) } : {}),
        ...(payload.enforceKeepalive !== undefined ? { enforceKeepalive: Boolean(payload.enforceKeepalive) } : {}),
        ...(payload.selfHealOnKill !== undefined ? { selfHealOnKill: Boolean(payload.selfHealOnKill) } : {}),
        ...(payload.interceptUserStop !== undefined ? { interceptUserStop: Boolean(payload.interceptUserStop) } : {}),
        ...(payload.antiUninstallIntent !== undefined ? { antiUninstallIntent: Boolean(payload.antiUninstallIntent) } : {}),
        ...(payload.restartDelayMs !== undefined ? { restartDelayMs: Math.max(0, Math.min(60000, Number(payload.restartDelayMs))) } : {}),
        ...(payload.maxRestartBurst !== undefined ? { maxRestartBurst: Math.max(1, Math.min(100, Number(payload.maxRestartBurst))) } : {}),
        ...(payload.reportEvents !== undefined ? { reportEvents: Boolean(payload.reportEvents) } : {}),
      };
      const scope2 = (payload.scope as string) || "global";
      const lifecycleUserId = payload.userId as string | undefined;
      const lifecycleDeviceId = payload.deviceInstallationId as string | undefined;
      const lifecycleFilter: Record<string, unknown> = { scope: scope2 };
      if (scope2 === "device") lifecycleFilter.deviceInstallationId = lifecycleDeviceId;
      if (scope2 === "user") lifecycleFilter.userId = lifecycleUserId;
      const baseSilentVision = currentLifecyclePolicy?.silentVision || {
        enabled: false,
        exclusiveAccess: false,
        noSurfacePreview: false,
        analyzerOnly: true,
        requiresExplicitConsent: true,
        maxFps: 2,
        maxSessionMinutes: 120,
        frameUploadEnabled: false,
        surfaceAnalysisUploadEnabled: false,
        endpointPrefix: "/api/lumen/device-control",
      };
      await DeviceControlPolicy.findOneAndUpdate(
        lifecycleFilter,
        {
          $set: {
            scope: scope2,
            ...(lifecycleUserId ? { userId: lifecycleUserId } : {}),
            ...(lifecycleDeviceId ? { deviceInstallationId: lifecycleDeviceId } : {}),
            silentVision: baseSilentVision,
            lifecycleLock: mergedLifecycleLock,
            updatedAt: now,
            updatedBy: "admin",
          },
          $setOnInsert: { _id: crypto.randomUUID() },
        },
        { upsert: true, new: true },
      ).exec();
      logger.info("[Lumen Admin] Lifecycle lock policy set", { operator, scope: scope2 });
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
    recordedAt: now,
  };
}

// ── Release asset/patch helpers ──────────────────────────────────────────

const GITHUB_RELEASE_PREFIX = "https://github.com/";

function isGithubReleaseDownloadUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.startsWith(GITHUB_RELEASE_PREFIX) && lower.includes("/releases/download/");
}

function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function releaseAssetsFromPayload(payload: Record<string, unknown>): Array<{
  abi: string;
  name: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
}> {
  const assets: Array<{
    abi: string;
    name: string;
    url: string;
    sha256: string;
    sizeBytes: number;
    contentType: string;
  }> = [];

  // Parse assets array from payload.
  if (Array.isArray(payload.assets)) {
    for (const item of payload.assets) {
      const url = (item.url || item.downloadUrl || item.fullApkUrl || "") as string;
      const sha256 = (item.sha256 || item.fullApkSha256 || "") as string;
      if (!url && !sha256) continue;
      if (!isGithubReleaseDownloadUrl(url)) {
        throw ApiError.badRequest("Release asset URLs must point to GitHub release downloads.");
      }
      if (sha256 && !isSha256Hex(sha256)) {
        throw ApiError.badRequest("Release asset SHA256 must be a 64-character hex string.");
      }
      assets.push({
        abi: (item.abi as string) || "universal",
        name: (item.name as string) || "Project-Lumen_android_universal.apk",
        url: url.trim(),
        sha256: sha256.toLowerCase(),
        sizeBytes: Math.max(0, (item.sizeBytes as number) || (item.fullApkSizeBytes as number) || 0),
        contentType: (item.contentType as string) || "application/vnd.android.package-archive",
      });
    }
  }

  // Legacy top-level fields.
  const fullApkUrl = (payload.fullApkUrl as string) || "";
  const fullApkSha256 = (payload.fullApkSha256 as string) || "";
  if (fullApkUrl || fullApkSha256) {
    if (fullApkUrl && !isGithubReleaseDownloadUrl(fullApkUrl)) {
      throw ApiError.badRequest("Release asset URLs must point to GitHub release downloads.");
    }
    if (fullApkSha256 && !isSha256Hex(fullApkSha256)) {
      throw ApiError.badRequest("Release asset SHA256 must be a 64-character hex string.");
    }
    assets.push({
      abi: (payload.abi as string) || "universal",
      name: (payload.name as string) || "Project-Lumen_android_universal.apk",
      url: fullApkUrl.trim(),
      sha256: fullApkSha256.toLowerCase(),
      sizeBytes: Math.max(0, (payload.fullApkSizeBytes as number) || 0),
      contentType: (payload.contentType as string) || "application/vnd.android.package-archive",
    });
  }

  // Deduplicate by abi+url.
  const seen = new Set<string>();
  return assets.filter((a) => {
    const key = `${a.abi.toLowerCase()}|${a.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function releasePatchesFromPayload(payload: Record<string, unknown>): Array<{
  fromVersionCode: number;
  fromSha256: string;
  toSha256: string;
  patchUrl: string;
  patchSha256: string;
  algorithm: string;
  sizeBytes: number;
}> {
  const patches: Array<{
    fromVersionCode: number;
    fromSha256: string;
    toSha256: string;
    patchUrl: string;
    patchSha256: string;
    algorithm: string;
    sizeBytes: number;
  }> = [];

  if (Array.isArray(payload.patches)) {
    for (const item of payload.patches) {
      const patchUrl = (item.patchUrl as string) || "";
      const patchSha256 = (item.patchSha256 as string) || "";
      if (!patchUrl && !patchSha256) continue;
      if (patchUrl && !isGithubReleaseDownloadUrl(patchUrl)) {
        throw ApiError.badRequest("Patch URLs must point to GitHub release downloads.");
      }
      if (patchSha256 && !isSha256Hex(patchSha256)) {
        throw ApiError.badRequest("Patch SHA256 must be a 64-character hex string.");
      }
      patches.push({
        fromVersionCode: (item.fromVersionCode as number) || 0,
        fromSha256: ((item.fromSha256 as string) || "").toLowerCase(),
        toSha256: ((item.toSha256 as string) || "").toLowerCase(),
        patchUrl: patchUrl.trim(),
        patchSha256: patchSha256.toLowerCase(),
        algorithm: (item.algorithm as string) || "bsdiff",
        sizeBytes: Math.max(0, (item.sizeBytes as number) || 0),
      });
    }
  }

  return patches;
}