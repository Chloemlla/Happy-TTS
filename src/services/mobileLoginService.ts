import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { getClientIP } from "../utils/ipUtils";
import { MobileClientTokenModel, type MobileClientTokenDoc } from "../models/mobileClientTokenModel";
import {
  assertActiveAuthSession,
  createAuthSession,
  getAuthSessionIpLocation,
  issueTrackedLoginToken,
  revokeAuthCredential,
  revokeAuthSessionsByClientTokenHashes,
  touchAuthSession,
  type AuthSessionMetadata,
} from "./authSessionService";
import { type User, UserStorage } from "../utils/userStorage";
import logger from "../utils/logger";
import {
  downgradedTtlMs,
  logIntegrityVerdict,
  shouldDowngradeForVerdict,
  verifyClientIntegrity,
} from "./mobileIntegrityService";
import {
  collectRotationRiskSignals,
  deviceFingerprintOf,
  isRotationRiskEnabled,
  resolveRotationInterval,
  type RotationRiskSignal,
} from "./mobileTokenRiskService";
import type { Request } from "express";

const CHALLENGE_TTL_MS = 3 * 60 * 1000;
const CLIENT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_CHALLENGES = 5000;

/**
 * 客户端登录令牌（sml_）轮换风控参数。
 * 策略正文见 docs/mobile-token-risk-control.md，客户端只跟着响应里的
 * nextRotationAt / graceMs 走，不自己算节奏。
 */
const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 降级态下的轮换间隔：设备证明没通过时，把下一次证明也提前。 */
const ROTATION_ELEVATED_INTERVAL_MS = 60 * 60 * 1000;
/** 同一代令牌的最短寿命；手动连点、脚本刷链到不了下一步。 */
const ROTATION_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** 一条血缘 24 小时内的轮换次数上限。 */
const ROTATION_DAILY_LIMIT = 8;
/** 旧令牌被顶替后还能用的窗口，给在途请求兜底；超过就当泄露处理。 */
const ROTATION_SUPERSEDED_GRACE_MS = 5 * 60 * 1000;

/** 带 HTTP 状态与错误码的令牌错误，控制器不再靠文案字串猜状态码。 */
export class MobileTokenError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status = 401, errorCode = "MOBILE_TOKEN_INVALID", retryAfterSeconds?: number) {
    super(message);
    this.name = "MobileTokenError";
    this.status = status;
    this.errorCode = errorCode;
    if (retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}

function lineageIdOf(doc: Pick<MobileClientTokenDoc, "tokenHash" | "lineageId">): string {
  // 字段上线前的存量令牌没有 lineageId，拿自己的 hash 当链根，
  // 至少能保证“它自己 + 它轮换出来的后代”在同一条链上。
  return doc.lineageId || doc.tokenHash;
}

type ChallengeStatus = "pending" | "scanned" | "approved" | "consumed" | "expired";

interface MobileLoginChallenge {
  sessionId: string;
  pollTokenHash: string;
  scanTokenHash: string;
  status: ChallengeStatus;
  createdAt: number;
  expiresAt: number;
  scannedAt?: number;
  approvedAt?: number;
  consumedAt?: number;
  approvedUserId?: string;
  browserIp?: string;
  browserUserAgent?: string;
  mobileIp?: string;
  mobileUserAgent?: string;
}

export interface MobileLoginPayload {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    isTranslationEnabled?: boolean;
    translationAccessUntil?: string;
    accountStatus?: string;
  };
}

const challenges = new Map<string, MobileLoginChallenge>();

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(expiresAt: number): boolean {
  return expiresAt <= Date.now();
}

function cleanupChallenges(): void {
  const now = Date.now();
  for (const [sessionId, challenge] of challenges.entries()) {
    if (challenge.expiresAt <= now || challenge.status === "consumed") {
      challenges.delete(sessionId);
    }
  }

  if (challenges.size <= MAX_CHALLENGES) return;

  const ordered = [...challenges.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [sessionId] of ordered.slice(0, challenges.size - MAX_CHALLENGES)) {
    challenges.delete(sessionId);
  }
}

async function toLoginPayload(user: User, metadata: AuthSessionMetadata = {}, clientTokenHash?: string): Promise<MobileLoginPayload> {
  const token = await issueTrackedLoginToken(user, metadata, { clientTokenHash });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isTranslationEnabled: (user as any).isTranslationEnabled,
      translationAccessUntil: (user as any).translationAccessUntil,
      accountStatus: (user as any).accountStatus,
    },
  };
}

async function updateLoginAudit(user: User, ip: string): Promise<User> {
  const updatedUser = await UserStorage.updateUser(user.id, {
    lastLoginIp: ip || "unknown",
    lastLoginAt: new Date().toISOString(),
  } as any);
  return updatedUser || user;
}

async function loadActiveUser(userId: string): Promise<User> {
  const user = await UserStorage.getUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }
  if ((user as any).accountStatus === "suspended") {
    throw new Error("账户已被封停");
  }
  return user;
}

export function createMobileLoginChallenge(params: {
  apiBaseUrl: string;
  browserIp?: string;
  browserUserAgent?: string;
}) {
  cleanupChallenges();

  const sessionId = randomToken(18);
  const pollToken = randomToken(32);
  const scanToken = randomToken(32);
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;
  const challenge: MobileLoginChallenge = {
    sessionId,
    pollTokenHash: hashToken(pollToken),
    scanTokenHash: hashToken(scanToken),
    status: "pending",
    createdAt: now,
    expiresAt,
    browserIp: params.browserIp,
    browserUserAgent: params.browserUserAgent,
  };
  challenges.set(sessionId, challenge);

  const qrUrl = new URL("synapse://mobile-login");
  qrUrl.searchParams.set("sessionId", sessionId);
  qrUrl.searchParams.set("scanToken", scanToken);
  qrUrl.searchParams.set("apiBaseUrl", params.apiBaseUrl);
  qrUrl.searchParams.set("expiresAt", new Date(expiresAt).toISOString());

  return {
    sessionId,
    pollToken,
    qrPayload: qrUrl.toString(),
    expiresAt: new Date(expiresAt).toISOString(),
    pollIntervalMs: 2000,
  };
}

export function markMobileLoginChallengeScanned(params: {
  sessionId: string;
  scanToken: string;
  mobileIp?: string;
  mobileUserAgent?: string;
}) {
  cleanupChallenges();
  const challenge = challenges.get(params.sessionId);
  if (!challenge || isExpired(challenge.expiresAt)) {
    return { ok: false, status: "expired" as ChallengeStatus, error: "扫码登录会话已过期" };
  }
  if (challenge.scanTokenHash !== hashToken(params.scanToken)) {
    return { ok: false, status: challenge.status, error: "扫码令牌无效" };
  }
  if (challenge.status === "pending") {
    challenge.status = "scanned";
    challenge.scannedAt = Date.now();
    challenge.mobileIp = params.mobileIp;
    challenge.mobileUserAgent = params.mobileUserAgent;
    challenges.set(params.sessionId, challenge);
  }
  return { ok: true, status: challenge.status, expiresAt: new Date(challenge.expiresAt).toISOString() };
}

export async function approveMobileLoginChallenge(params: {
  sessionId: string;
  scanToken: string;
  user: User;
  mobileIp?: string;
  mobileUserAgent?: string;
}) {
  cleanupChallenges();
  const challenge = challenges.get(params.sessionId);
  if (!challenge || isExpired(challenge.expiresAt)) {
    return { ok: false, status: "expired" as ChallengeStatus, error: "扫码登录会话已过期" };
  }
  if (challenge.scanTokenHash !== hashToken(params.scanToken)) {
    return { ok: false, status: challenge.status, error: "扫码令牌无效" };
  }
  if (challenge.status === "consumed" || challenge.status === "approved") {
    return { ok: false, status: challenge.status, error: "扫码登录会话已完成" };
  }
  if ((params.user as any).accountStatus === "suspended") {
    return { ok: false, status: challenge.status, error: "账户已被封停" };
  }

  challenge.status = "approved";
  challenge.approvedAt = Date.now();
  challenge.approvedUserId = params.user.id;
  challenge.mobileIp = params.mobileIp;
  challenge.mobileUserAgent = params.mobileUserAgent;
  challenges.set(params.sessionId, challenge);

  return { ok: true, status: challenge.status, expiresAt: new Date(challenge.expiresAt).toISOString() };
}

export async function pollMobileLoginChallenge(params: {
  sessionId: string;
  pollToken: string;
  browserIp?: string;
}) {
  cleanupChallenges();
  const challenge = challenges.get(params.sessionId);
  if (!challenge || isExpired(challenge.expiresAt)) {
    return { status: "expired" as ChallengeStatus, expiresAt: null };
  }
  if (challenge.pollTokenHash !== hashToken(params.pollToken)) {
    throw new Error("轮询令牌无效");
  }
  if (challenge.status !== "approved" || !challenge.approvedUserId) {
    return { status: challenge.status, expiresAt: new Date(challenge.expiresAt).toISOString() };
  }

  const user = await loadActiveUser(challenge.approvedUserId);
  const updatedUser = await updateLoginAudit(user, params.browserIp || "unknown");
  challenge.status = "consumed";
  challenge.consumedAt = Date.now();
  challenges.set(params.sessionId, challenge);

  return {
    status: "approved" as ChallengeStatus,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
    ...(await toLoginPayload(updatedUser, {
      ipAddress: params.browserIp,
      userAgent: challenge.browserUserAgent,
      clientType: "web",
      deviceName: challenge.browserUserAgent,
    })),
  };
}

export async function issueClientLoginToken(params: {
  user: User;
  deviceId?: string;
  deviceName?: string;
  metadata?: AuthSessionMetadata;
  integrityToken?: string;
  integrityNonce?: string;
}) {
  if ((params.user as any).accountStatus === "suspended") {
    throw new Error("账户已被封停");
  }

  const verdict = await verifyClientIntegrity({
    integrityToken: params.integrityToken,
    nonce: params.integrityNonce,
    userId: params.user.id,
    deviceId: params.deviceId,
  });
  const downgraded = shouldDowngradeForVerdict(verdict);
  logIntegrityVerdict({
    verdict,
    userId: params.user.id,
    deviceId: params.deviceId,
    ip: params.metadata?.ipAddress,
    downgraded,
  });

  const token = `sml_${randomToken(40)}`;
  const now = Date.now();
  const ttlMs = downgraded ? downgradedTtlMs() : CLIENT_TOKEN_TTL_MS;
  const expiresAt = now + ttlMs;
  const deviceId = typeof params.deviceId === "string" ? params.deviceId.slice(0, 128) : undefined;
  const deviceName = typeof params.deviceName === "string" ? params.deviceName.slice(0, 128) : undefined;
  // P3：设备首次出现的时间与"待重新验证"标记跟着令牌走，第一次轮换就能用上。
  const deviceFingerprint = deviceFingerprintOf(deviceId, deviceName);
  const deviceFirstSeenAt = await resolveDeviceFirstSeenAt({
    userId: params.user.id,
    deviceFingerprint,
    fallback: now,
  });
  const verificationPending = verdict.evaluated && !verdict.trusted;

  // G2-18: 同一设备的旧令牌先撤销，再写入新令牌（单文档原子，防止并发读改写回滚撤销）。
  const replacedTokenHashes: string[] = [];
  if (deviceId) {
    const oldTokens = (await MobileClientTokenModel.find({
      userId: params.user.id,
      deviceId,
      revokedAt: null,
    })
      .select("tokenHash")
      .lean()) as Array<{ tokenHash: string }>;
    replacedTokenHashes.push(...oldTokens.map((doc) => doc.tokenHash));
    if (replacedTokenHashes.length > 0) {
      await MobileClientTokenModel.updateMany(
        { tokenHash: { $in: replacedTokenHashes }, revokedAt: null },
        { $set: { revokedAt: now } },
      );
    }
  }

  await MobileClientTokenModel.create({
    tokenHash: hashToken(token),
    userId: params.user.id,
    deviceId,
    deviceName,
    createdAt: now,
    expiresAt,
    ttlExpireAt: new Date(expiresAt),
    // 一次“登录”开一条新血缘，之后的每日轮换在这条链上往后延。
    lineageId: hashToken(token),
    rotationIndex: 0,
    deviceFingerprint,
    deviceFirstSeenAt,
    verificationPending,
  });
  await revokeAuthSessionsByClientTokenHashes(params.user.id, replacedTokenHashes);
  await createAuthSession({
    userId: params.user.id,
    credential: token,
    credentialType: "client-token",
    authKind: "client-token",
    clientTokenHash: hashToken(token),
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    ...params.metadata,
  });

  return {
    clientLoginToken: token,
    expiresAt: new Date(expiresAt).toISOString(),
    requiresVerification: downgraded,
  };
}

/**
 * 这台设备在该账号上首次出现的时间：库里有记录就继承，没有就算作现在。
 * 只在风险分级轮换开着的时候查库 —— 没开这一层就不该为它多打一次查询。
 */
async function resolveDeviceFirstSeenAt(params: {
  userId: string;
  deviceFingerprint?: string;
  fallback: number;
}): Promise<number> {
  if (!params.deviceFingerprint || !isRotationRiskEnabled()) return params.fallback;
  const earliest = (await MobileClientTokenModel.findOne({
    userId: params.userId,
    deviceFingerprint: params.deviceFingerprint,
  })
    .sort({ createdAt: 1 })
    .select("deviceFirstSeenAt createdAt")
    .lean()) as { deviceFirstSeenAt?: number; createdAt?: number } | null;
  if (!earliest) return params.fallback;
  return earliest.deviceFirstSeenAt ?? earliest.createdAt ?? params.fallback;
}

async function loadActiveClientTokenDoc(token: string): Promise<MobileClientTokenDoc> {
  if (!token.startsWith("sml_") || token.length < 32) {
    throw new MobileTokenError("客户端登录令牌无效", 401, "MOBILE_TOKEN_INVALID");
  }
  const doc = (await MobileClientTokenModel.findOne({ tokenHash: hashToken(token) }).lean()) as
    | MobileClientTokenDoc
    | null;
  if (!doc) {
    throw new MobileTokenError("客户端登录令牌无效或已过期", 401, "MOBILE_TOKEN_INVALID");
  }
  if (doc.revokedAt) {
    throw new MobileTokenError("客户端登录令牌已撤销，请重新登录", 401, "MOBILE_TOKEN_REVOKED");
  }
  if (isExpired(doc.expiresAt)) {
    throw new MobileTokenError("客户端登录令牌已过期，请重新登录", 401, "MOBILE_TOKEN_EXPIRED");
  }
  return doc;
}

/**
 * 已被顶替的令牌又回来用：宽限期内放行（在途请求），超期就是泄露/克隆，
 * 整条血缘一次干掉。真机不会拿到旧代（换票后本地整体覆盖），误伤面极低。
 */
async function assertTokenNotSuperseded(doc: MobileClientTokenDoc, ip: string): Promise<void> {
  const supersededAt = doc.supersededAt;
  if (!supersededAt) return;
  if (Date.now() - supersededAt <= ROTATION_SUPERSEDED_GRACE_MS) return;

  await revokeClientTokenLineage({ userId: doc.userId, lineageId: lineageIdOf(doc) });
  // 存量令牌可能没有 lineageId（上面按链吊销不到东西），把递上来的这一张单独摘掉。
  await MobileClientTokenModel.updateOne(
    { tokenHash: doc.tokenHash, revokedAt: null },
    { $set: { revokedAt: Date.now() } },
  );
  // 在触发断链的这一张上打复用标记，供后台复用看板按 reusedAt 查询（P4）。
  // 与 revokedAt 分开写：整链吊销已经把 revokedAt 占了，这里只补取证字段。
  await MobileClientTokenModel.updateOne(
    { tokenHash: doc.tokenHash },
    { $set: { reusedAt: Date.now(), reusedIp: ip } },
  );
  await revokeAuthSessionsByClientTokenHashes(doc.userId, [doc.tokenHash]);
  logger.warn("[MobileToken] 旧令牌超宽限期后被重复使用，已吊销整条血缘", {
    userId: doc.userId,
    deviceId: doc.deviceId,
    lineageId: lineageIdOf(doc),
    rotationIndex: doc.rotationIndex ?? 0,
    supersededAt: new Date(supersededAt).toISOString(),
    ip,
  });
  throw new MobileTokenError("客户端登录令牌已失效，请重新登录", 401, "MOBILE_TOKEN_REUSED");
}

/** 整链吊销：把这条血缘下尚未撤销的令牌连同它们的会话一次干掉。 */
export async function revokeClientTokenLineage(params: { userId: string; lineageId: string }): Promise<number> {
  const docs = (await MobileClientTokenModel.find({
    userId: params.userId,
    lineageId: params.lineageId,
    revokedAt: null,
  })
    .select("tokenHash")
    .lean()) as Array<{ tokenHash: string }>;

  if (docs.length === 0) return 0;
  const tokenHashes = docs.map((doc) => doc.tokenHash);
  const now = Date.now();
  await MobileClientTokenModel.updateMany(
    { userId: params.userId, tokenHash: { $in: tokenHashes }, revokedAt: null },
    { $set: { revokedAt: now } },
  );
  await revokeAuthSessionsByClientTokenHashes(params.userId, tokenHashes);
  return tokenHashes.length;
}

/**
 * 轮换一张客户端登录令牌：同一 userId / deviceId 下铸新一代，旧代只标记
 * supersededAt（不提前撤销，给它留出在途请求的宽限期），并为新令牌新建一条
 * client-token 会话。
 *
 * 已签发的 JWT 会话本来就挂在旧 hash 的 clientTokenHash 上，不因为轮换而被抹掉，
 * 这就是“轮换但保留登录状态”的落地方式；只有整链吊销才会一次清空。
 */
export async function rotateClientLoginToken(params: {
  clientLoginToken: string;
  deviceId?: string;
  ip?: string;
  fingerprint?: string;
  metadata?: AuthSessionMetadata;
  integrityToken?: string;
  integrityNonce?: string;
}) {
  const now = Date.now();
  const ip = params.ip || "unknown";
  const token = typeof params.clientLoginToken === "string" ? params.clientLoginToken.trim() : "";
  const doc = await loadActiveClientTokenDoc(token);

  if (doc.deviceId && doc.deviceId !== params.deviceId) {
    throw new MobileTokenError("客户端登录令牌与设备不匹配", 403, "MOBILE_TOKEN_DEVICE_MISMATCH");
  }
  await assertTokenNotSuperseded(doc, ip);
  await assertClientTokenSession(doc.userId, token);

  const sinceIssue = now - doc.createdAt;
  if (sinceIssue < ROTATION_MIN_INTERVAL_MS) {
    const retryAfterSeconds = Math.ceil((ROTATION_MIN_INTERVAL_MS - sinceIssue) / 1000);
    throw new MobileTokenError(
      "轮换过于频繁，请稍后再试",
      429,
      "MOBILE_TOKEN_ROTATION_THROTTLED",
      retryAfterSeconds,
    );
  }

  const lineageId = lineageIdOf(doc);
  const rotationsLast24h = await MobileClientTokenModel.countDocuments({
    userId: doc.userId,
    lineageId,
    createdAt: { $gte: now - 24 * 60 * 60 * 1000 },
  });
  if (rotationsLast24h >= ROTATION_DAILY_LIMIT) {
    logger.warn("[MobileToken] 令牌轮换超出 24 小时配额", {
      userId: doc.userId,
      deviceId: doc.deviceId,
      lineageId,
      rotationsLast24h,
      ip,
    });
    throw new MobileTokenError(
      "今日令牌轮换次数已用完，请稍后再试",
      429,
      "MOBILE_TOKEN_ROTATION_QUOTA",
      60 * 60,
    );
  }

  // 设备证明放在所有本地风控之后：被拒绝的请求不该先花掉一次 Google 调用与一个 nonce。
  const verdict = await verifyClientIntegrity({
    integrityToken: params.integrityToken,
    nonce: params.integrityNonce,
    userId: doc.userId,
    deviceId: doc.deviceId || params.deviceId,
  });
  const downgraded = shouldDowngradeForVerdict(verdict);
  logIntegrityVerdict({ verdict, userId: doc.userId, deviceId: doc.deviceId, ip, downgraded });

  const nextToken = `sml_${randomToken(40)}`;
  const nextHash = hashToken(nextToken);
  const expiresAt = now + (downgraded ? downgradedTtlMs() : CLIENT_TOKEN_TTL_MS);
  const rotationIndex = (doc.rotationIndex ?? 0) + 1;
  // P3：设备首见时间跨代继承；设备证明这轮通过了才算把"待重新验证"清掉。
  const deviceFingerprint = doc.deviceFingerprint ?? deviceFingerprintOf(doc.deviceId, doc.deviceName);
  const deviceFirstSeenAt = await resolveDeviceFirstSeenAt({
    userId: doc.userId,
    deviceFingerprint,
    fallback: doc.deviceFirstSeenAt ?? doc.createdAt,
  });
  const verdictUntrusted = verdict.evaluated && !verdict.trusted;
  const verificationPending = verdictUntrusted
    ? true
    : verdict.evaluated
      ? false
      : Boolean(doc.verificationPending);

  await MobileClientTokenModel.create({
    tokenHash: nextHash,
    userId: doc.userId,
    deviceId: doc.deviceId,
    deviceName: doc.deviceName,
    createdAt: now,
    expiresAt,
    ttlExpireAt: new Date(expiresAt),
    lineageId,
    rotationIndex,
    rotatedFrom: doc.tokenHash,
    deviceFingerprint,
    deviceFirstSeenAt,
    verificationPending,
  });

  // 旧代先打 superseded 标记；不写 revokedAt，否则在途请求会当场失败。
  const supersedeSet: Record<string, unknown> = {
    supersededAt: now,
    supersededTo: nextHash,
    rotatedIp: ip,
    lastUsedAt: now,
    lastUsedIp: ip,
  };
  if (typeof params.fingerprint === "string" && params.fingerprint.trim()) {
    supersedeSet.rotatedFingerprint = params.fingerprint.trim().slice(0, 128);
  }
  await MobileClientTokenModel.updateOne(
    { tokenHash: doc.tokenHash },
    { $set: supersedeSet },
  );

  const session = await createAuthSession({
    userId: doc.userId,
    credential: nextToken,
    credentialType: "client-token",
    authKind: "client-token",
    clientTokenHash: nextHash,
    deviceId: doc.deviceId,
    deviceName: doc.deviceName,
    ...params.metadata,
    ipAddress: ip,
  });

  // 风险分级（P3）放在最后：属地取的是刚建好的这条会话算出来的值，
  // 因此这一层不额外发一次归属地查询，也不改变上面任何一步的顺序。
  const riskSignals = await assessRotationRisk({
    doc,
    ipLocation: session?.ipLocation,
    deviceFirstSeenAt,
    verificationPending,
    verdictUntrusted,
    now,
  });
  if (riskSignals.length > 0) {
    await MobileClientTokenModel.updateOne(
      { tokenHash: doc.tokenHash },
      { $set: { riskSignals } },
    );
  }

  // 降级（P2）与风险信号（P3）都只做一件事：把下一次轮换提前。
  const rotationIntervalMs = downgraded
    ? ROTATION_ELEVATED_INTERVAL_MS
    : resolveRotationInterval(riskSignals, ROTATION_INTERVAL_MS);

  logger.info("[MobileToken] 客户端登录令牌已轮换", {
    userId: doc.userId,
    deviceId: doc.deviceId,
    lineageId,
    rotationIndex,
    rotationsLast24h: rotationsLast24h + 1,
    downgraded,
    riskSignals,
    escalationReason: downgraded || riskSignals.length > 0 ? "elevated" : "default",
    ip,
  });

  return {
    clientLoginToken: nextToken,
    expiresAt: new Date(expiresAt).toISOString(),
    rotatedAt: new Date(now).toISOString(),
    nextRotationAt: new Date(now + rotationIntervalMs).toISOString(),
    rotationIndex,
    rotateIntervalMs: rotationIntervalMs,
    graceMs: ROTATION_SUPERSEDED_GRACE_MS,
    requiresVerification: downgraded,
    // 给客户端的只是一句话："这次是提级节奏"，不解释命中了哪几路信号。
    escalated: downgraded || riskSignals.length > 0,
  };
}

/**
 * 轮换时的风险分级。只做判定与日志，不改任何写入 —— 上一代签发时的属地取自
 * 会话台账（`getAuthSessionIpLocation`），这一代的属地由调用方传进来。
 * 本层没启用时直接返回空数组，连那一次查询都不发。
 */
async function assessRotationRisk(params: {
  doc: MobileClientTokenDoc;
  ipLocation?: string | null;
  deviceFirstSeenAt: number;
  verificationPending: boolean;
  verdictUntrusted: boolean;
  now: number;
}): Promise<RotationRiskSignal[]> {
  if (!isRotationRiskEnabled()) return [];

  const previousIpLocation = await getAuthSessionIpLocation(params.doc.userId, params.doc.tokenHash);
  const signals = collectRotationRiskSignals({
    previousIpLocation,
    currentIpLocation: params.ipLocation,
    verificationPending: params.verificationPending,
    verdictUntrusted: params.verdictUntrusted,
    deviceFirstSeenAt: params.deviceFirstSeenAt,
    now: params.now,
  });

  if (signals.length > 0) {
    logger.info("[MobileToken] 本次轮换命中风险信号，已把下一次轮换提前", {
      userId: params.doc.userId,
      deviceId: params.doc.deviceId,
      lineageId: lineageIdOf(params.doc),
      rotationIndex: (params.doc.rotationIndex ?? 0) + 1,
      signals,
      previousIpLocation: previousIpLocation || undefined,
      deviceFirstSeenAt: new Date(params.deviceFirstSeenAt).toISOString(),
    });
  }

  return signals;
}

/**
 * 完整性挑战端点专用的身份解析：要么 JWT（首次签发），要么 sml_ 令牌（轮换）。
 * 只读校验，不轮换、不消耗令牌 —— nonce 只是把"这次证明属于谁、哪台设备"记下来。
 */
export async function resolveClientTokenIdentity(params: {
  authHeader?: unknown;
  clientLoginToken?: string;
  deviceId?: string;
  ip?: string;
}): Promise<{ userId: string; deviceId?: string }> {
  const bearerUser = await resolveUserFromBearerToken(params.authHeader);
  if (bearerUser) {
    return { userId: bearerUser.id, deviceId: params.deviceId };
  }

  const token = typeof params.clientLoginToken === "string" ? params.clientLoginToken.trim() : "";
  if (!token) {
    throw new MobileTokenError("缺少客户端登录令牌", 400, "MISSING_CLIENT_TOKEN");
  }
  const doc = await loadActiveClientTokenDoc(token);
  if (doc.deviceId && doc.deviceId !== params.deviceId) {
    throw new MobileTokenError("客户端登录令牌与设备不匹配", 403, "MOBILE_TOKEN_DEVICE_MISMATCH");
  }
  await assertTokenNotSuperseded(doc, params.ip || "unknown");
  await assertClientTokenSession(doc.userId, token);
  return { userId: doc.userId, deviceId: doc.deviceId || params.deviceId };
}

export async function exchangeClientLoginToken(params: {
  clientLoginToken: string;
  deviceId?: string;
  ip?: string;
  metadata?: AuthSessionMetadata;
}) {
  const token = typeof params.clientLoginToken === "string" ? params.clientLoginToken.trim() : "";
  const doc = await loadActiveClientTokenDoc(token);

  if (doc.deviceId && doc.deviceId !== params.deviceId) {
    throw new MobileTokenError("客户端登录令牌与设备不匹配", 403, "MOBILE_TOKEN_DEVICE_MISMATCH");
  }
  await assertTokenNotSuperseded(doc, params.ip || "unknown");
  await assertClientTokenSession(doc.userId, token);

  const user = await loadActiveUser(doc.userId);
  const updatedUser = await updateLoginAudit(user, params.ip || "unknown");
  const now = Date.now();
  await MobileClientTokenModel.updateOne(
    { tokenHash: doc.tokenHash, revokedAt: null },
    { $set: { lastUsedAt: now, lastUsedIp: params.ip || "unknown" } },
  );

  const metadata = {
    ...params.metadata,
    ipAddress: params.ip || params.metadata?.ipAddress,
    deviceId: params.deviceId || params.metadata?.deviceId || doc.deviceId,
    deviceName: params.metadata?.deviceName || doc.deviceName,
  };
  await touchAuthSession(doc.userId, token, metadata);
  return toLoginPayload(updatedUser, metadata, doc.tokenHash);
}

/**
 * 令牌对应的 client-token 会话必须还活着；被撤销过就当作需要重新登录，
 * 不能拿一张“会话已被撤销”的令牌继续换 JWT。
 */
async function assertClientTokenSession(userId: string, token: string): Promise<void> {
  try {
    await assertActiveAuthSession(userId, token);
  } catch (error) {
    if (error instanceof MobileTokenError) throw error;
    throw new MobileTokenError("登录会话已撤销，请重新登录", 401, "MOBILE_SESSION_REVOKED");
  }
}

export async function revokeClientLoginToken(params: { clientLoginToken: string; userId: string }) {
  const token = params.clientLoginToken.trim();
  const tokenHash = hashToken(token);
  // G2-18: 原子条件更新（tokenHash + userId + revokedAt:null），防止并发读改写回滚撤销。
  const result = await MobileClientTokenModel.updateOne(
    { tokenHash, userId: params.userId, revokedAt: null },
    { $set: { revokedAt: Date.now() } },
  );
  await revokeAuthCredential(params.userId, token);
  // 撤销必须覆盖整条血缘：留着上一代就等于留着一条还能换 JWT 的备用钥匙。
  const doc = (await MobileClientTokenModel.findOne({ tokenHash, userId: params.userId }).lean()) as
    | MobileClientTokenDoc
    | null;
  if (doc) {
    await revokeClientTokenLineage({ userId: params.userId, lineageId: lineageIdOf(doc) });
  }
  return { revoked: Number(result.modifiedCount || 0) > 0 };
}

export async function revokeClientLoginTokensByHashes(params: { userId: string; tokenHashes: string[] }): Promise<void> {
  if (params.tokenHashes.length === 0) return;
  const tokenHashes = Array.from(new Set(params.tokenHashes));
  await MobileClientTokenModel.updateMany(
    { userId: params.userId, tokenHash: { $in: tokenHashes }, revokedAt: null },
    { $set: { revokedAt: Date.now() } },
  );
}

export async function resolveUserFromBearerToken(authHeader: unknown): Promise<User | null> {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { userId?: string; sub?: string };
    const userId = decoded.userId || decoded.sub;
    if (!userId) return null;
    await assertActiveAuthSession(userId, token);
    return await loadActiveUser(userId);
  } catch {
    return null;
  }
}

export async function resolveMobileLoginUser(req: Request): Promise<User | null> {
  const bearerUser = await resolveUserFromBearerToken(req.headers.authorization);
  if (bearerUser) return bearerUser;

  const clientLoginToken = typeof req.body?.clientLoginToken === "string" ? req.body.clientLoginToken : "";
  if (!clientLoginToken) return null;

  const payload = await exchangeClientLoginToken({
    clientLoginToken,
    deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined,
    ip: getClientIP(req),
    metadata: {
      userAgent: String(req.headers["user-agent"] || "unknown"),
      deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName : undefined,
      platform: typeof req.body?.platform === "string" ? req.body.platform : undefined,
      clientType: typeof req.body?.clientType === "string" ? (req.body.clientType as any) : undefined,
    },
  });
  return loadActiveUser(payload.user.id);
}

export function resetMobileLoginStateForTests(): void {
  challenges.clear();
}
