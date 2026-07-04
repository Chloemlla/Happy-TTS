import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { signLoginToken } from "../utils/authToken";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";
import type { Request } from "express";

const CHALLENGE_TTL_MS = 3 * 60 * 1000;
const CLIENT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_CHALLENGES = 5000;
const TOKEN_FILE = path.join(process.cwd(), "data", "mobile_login_client_tokens.json");

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

interface ClientTokenRecord {
  tokenHash: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  lastUsedIp?: string;
  revokedAt?: number;
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

function ensureTokenFile(): void {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(TOKEN_FILE)) {
    fs.writeFileSync(TOKEN_FILE, "[]", "utf-8");
  }
}

function readClientTokens(): ClientTokenRecord[] {
  try {
    ensureTokenFile();
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error("[MobileLogin] Failed to read client token store", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function writeClientTokens(records: ClientTokenRecord[]): void {
  try {
    ensureTokenFile();
    const activeRecords = records.filter((record) => !record.revokedAt && !isExpired(record.expiresAt));
    const tmpFile = `${TOKEN_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(activeRecords, null, 2), "utf-8");
    fs.renameSync(tmpFile, TOKEN_FILE);
  } catch (error) {
    logger.error("[MobileLogin] Failed to write client token store", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("客户端令牌存储不可用");
  }
}

function toLoginPayload(user: User): MobileLoginPayload {
  return {
    token: signLoginToken(user),
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
    ...toLoginPayload(updatedUser),
  };
}

export async function issueClientLoginToken(params: {
  user: User;
  deviceId?: string;
  deviceName?: string;
}) {
  if ((params.user as any).accountStatus === "suspended") {
    throw new Error("账户已被封停");
  }

  const token = `sml_${randomToken(40)}`;
  const now = Date.now();
  const records = readClientTokens().filter((record) => !record.revokedAt && !isExpired(record.expiresAt));
  const deviceId = typeof params.deviceId === "string" ? params.deviceId.slice(0, 128) : undefined;
  const deviceName = typeof params.deviceName === "string" ? params.deviceName.slice(0, 128) : undefined;
  const filtered = deviceId
    ? records.filter((record) => !(record.userId === params.user.id && record.deviceId === deviceId))
    : records;

  filtered.push({
    tokenHash: hashToken(token),
    userId: params.user.id,
    deviceId,
    deviceName,
    createdAt: now,
    expiresAt: now + CLIENT_TOKEN_TTL_MS,
  });
  writeClientTokens(filtered);

  return {
    clientLoginToken: token,
    expiresAt: new Date(now + CLIENT_TOKEN_TTL_MS).toISOString(),
  };
}

export async function exchangeClientLoginToken(params: {
  clientLoginToken: string;
  deviceId?: string;
  ip?: string;
}) {
  const token = typeof params.clientLoginToken === "string" ? params.clientLoginToken.trim() : "";
  if (!token.startsWith("sml_") || token.length < 32) {
    throw new Error("客户端登录令牌无效");
  }

  const tokenHash = hashToken(token);
  const records = readClientTokens();
  const record = records.find((item) => item.tokenHash === tokenHash);
  if (!record || record.revokedAt || isExpired(record.expiresAt)) {
    writeClientTokens(records);
    throw new Error("客户端登录令牌无效或已过期");
  }
  if (record.deviceId && record.deviceId !== params.deviceId) {
    throw new Error("客户端登录令牌与设备不匹配");
  }

  const user = await loadActiveUser(record.userId);
  const updatedUser = await updateLoginAudit(user, params.ip || "unknown");
  record.lastUsedAt = Date.now();
  record.lastUsedIp = params.ip || "unknown";
  writeClientTokens(records);

  return toLoginPayload(updatedUser);
}

export async function revokeClientLoginToken(params: { clientLoginToken: string; userId: string }) {
  const tokenHash = hashToken(params.clientLoginToken.trim());
  const records = readClientTokens();
  let revoked = false;
  for (const record of records) {
    if (record.tokenHash === tokenHash && record.userId === params.userId && !record.revokedAt) {
      record.revokedAt = Date.now();
      revoked = true;
    }
  }
  writeClientTokens(records);
  return { revoked };
}

export async function resolveUserFromBearerToken(authHeader: unknown): Promise<User | null> {
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId?: string; sub?: string };
    const userId = decoded.userId || decoded.sub;
    return userId ? await loadActiveUser(userId) : null;
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
  });
  return loadActiveUser(payload.user.id);
}

export function resetMobileLoginStateForTests(): void {
  challenges.clear();
}
