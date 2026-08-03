import crypto from "node:crypto";
import type { Request } from "express";
import { AuthSessionModel, type AuthClientType, type AuthSessionDoc, type AuthSessionKind } from "../models/authSessionModel";
import { config } from "../config/config";
import { OAuthTokenModel } from "../models/oauthModel";
import { getCachedIpLocation, lookupIpLocation } from "./ipTelemetryService";
import { signLoginToken } from "../utils/authToken";
import logger from "../utils/logger";
import { type User } from "../utils/userStorage";

export interface AuthSessionMetadata {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  clientType?: AuthClientType;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthSessionCreateInput extends AuthSessionMetadata {
  userId: string;
  credential: string;
  credentialType: AuthSessionDoc["credentialType"];
  authKind: AuthSessionKind;
  oauthClientId?: string;
  oauthTokenId?: string;
  oauthGrantId?: string;
  clientTokenHash?: string;
}

export interface TrackedLoginLinks {
  clientTokenHash?: string;
}

export interface AuthSessionView {
  sessionId: string;
  deviceKey: string;
  deviceId: string | null;
  deviceName: string;
  platform: string;
  clientType: AuthClientType;
  recentActivityAt: string;
  ip: string;
  ipLocation: string;
  current: boolean;
  revoked: boolean;
  authKind: AuthSessionKind;
  oauthClientId: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface AuthDeviceView {
  deviceKey: string;
  deviceId: string | null;
  deviceName: string;
  platform: string;
  clientType: AuthClientType;
  recentActivityAt: string;
  ip: string;
  ipLocation: string;
  current: boolean;
  revoked: boolean;
  sessions: AuthSessionView[];
}

export class AuthSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "SESSION_NOT_FOUND" | "SESSION_REVOKED" | "CURRENT_SESSION_PROTECTED" = "SESSION_NOT_FOUND",
  ) {
    super(message);
    this.name = "AuthSessionError";
  }
}

function clampText(value: unknown, max: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text ? text.slice(0, max) : fallback;
}

export function hashAuthCredential(value: string): string {
  return crypto.createHmac("sha256", config.jwtSecret).update(value).digest("hex");
}

function normalizeClientType(value: unknown): AuthClientType {
  const normalized = clampText(value, 64, "web").toLowerCase();
  if (normalized === "piliplus" || normalized.includes("pili")) return "PiliPlus";
  if (normalized === "synapse-client" || normalized.includes("synapse")) return "Synapse-Client";
  if (normalized === "web" || normalized.includes("browser")) return "web";
  return "other";
}

function inferPlatform(clientType: AuthClientType, value: unknown, userAgent: string): string {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 64);
  if (clientType === "web") {
    if (/android/i.test(userAgent)) return "Android Web";
    if (/iphone|ipad|ios/i.test(userAgent)) return "iOS Web";
    if (/windows/i.test(userAgent)) return "Windows Web";
    if (/macintosh|mac os/i.test(userAgent)) return "macOS Web";
    return "Web";
  }
  return clientType;
}

export function getAuthSessionMetadata(req: Request, overrides: AuthSessionMetadata = {}): AuthSessionMetadata {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const header = (name: string): string | undefined => {
    const value = req.headers?.[name];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  };
  const userAgent = clampText(overrides.userAgent ?? header("user-agent"), 512, "unknown");
  const clientType = normalizeClientType(
    overrides.clientType ?? body.clientType ?? body.client ?? body.clientName ?? header("x-client-name") ?? header("x-client"),
  );
  return {
    deviceId: clampText(overrides.deviceId ?? body.deviceId ?? body.device_id ?? body.fingerprint ?? header("x-device-id"), 160, "") || undefined,
    deviceName: clampText(overrides.deviceName ?? body.deviceName ?? header("x-device-name"), 128, userAgent),
    platform: inferPlatform(clientType, overrides.platform ?? body.platform ?? header("x-platform"), userAgent),
    clientType,
    ipAddress: clampText(overrides.ipAddress ?? req.ip ?? req.socket?.remoteAddress, 128, "unknown"),
    userAgent,
  };
}

function deriveDeviceKey(userId: string, metadata: AuthSessionMetadata): string {
  const clientType = normalizeClientType(metadata.clientType);
  const seed = clampText(metadata.deviceId, 160, "") || clampText(metadata.userAgent, 512, "unknown");
  return crypto.createHash("sha256").update(`${userId}|${clientType}|${seed}`).digest("hex").slice(0, 40);
}

async function resolveIpLocation(ip: string): Promise<string> {
  try {
    const cached = await getCachedIpLocation(ip);
    if (cached?.location) return cached.location;
    if (ip === "unknown") return "未知";
    return (await lookupIpLocation(ip, 1500)).slice(0, 256) || "未知";
  } catch (error) {
    logger.warn("[AuthSession] IP 属地查询失败", { ip, error: error instanceof Error ? error.message : String(error) });
    return "未知";
  }
}

export async function createAuthSession(input: AuthSessionCreateInput): Promise<AuthSessionDoc> {
  const now = new Date();
  const metadata = getAuthSessionMetadataFromInput(input);
  const ipLocation = await resolveIpLocation(metadata.ipAddress);
  const session = await AuthSessionModel.create({
    sessionId: `as_${crypto.randomBytes(16).toString("hex")}`,
    userId: input.userId,
    credentialHash: hashAuthCredential(input.credential),
    credentialType: input.credentialType,
    authKind: input.authKind,
    deviceKey: deriveDeviceKey(input.userId, metadata),
    deviceId: metadata.deviceId || null,
    deviceName: metadata.deviceName,
    platform: metadata.platform,
    clientType: metadata.clientType,
    ipAddress: metadata.ipAddress,
    ipLocation,
    userAgent: metadata.userAgent,
    oauthClientId: input.oauthClientId || null,
    oauthTokenId: input.oauthTokenId || null,
    oauthGrantId: input.oauthGrantId || null,
    clientTokenHash: input.clientTokenHash || null,
    createdAt: now,
    lastActivityAt: now,
    revokedAt: null,
    updatedAt: now,
  });
  return session.toObject() as AuthSessionDoc;
}

function getAuthSessionMetadataFromInput(input: AuthSessionCreateInput): Required<AuthSessionMetadata> {
  const userAgent = clampText(input.userAgent, 512, "unknown");
  const clientType = normalizeClientType(input.clientType);
  return {
    deviceId: clampText(input.deviceId, 160, ""),
    deviceName: clampText(input.deviceName, 128, userAgent),
    platform: inferPlatform(clientType, input.platform, userAgent),
    clientType,
    ipAddress: clampText(input.ipAddress, 128, "unknown"),
    userAgent,
  };
}

export async function issueTrackedLoginToken(
  user: User,
  metadata: AuthSessionMetadata = {},
  links: TrackedLoginLinks = {},
): Promise<string> {
  const token = signLoginToken(user);
  await createAuthSession({
    ...metadata,
    userId: user.id,
    credential: token,
    credentialType: "jwt",
    authKind: "jwt",
    clientTokenHash: links.clientTokenHash,
  });
  return token;
}

export async function revokeAuthCredential(userId: string, credential: string): Promise<void> {
  await AuthSessionModel.updateOne(
    { userId, credentialHash: hashAuthCredential(credential), revokedAt: null },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function revokeAuthSessionsByOauthTokenIds(tokenIds: string[]): Promise<void> {
  if (tokenIds.length === 0) return;
  await AuthSessionModel.updateMany(
    { oauthTokenId: { $in: tokenIds }, revokedAt: null },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function revokeAuthSessionsByClientTokenHashes(userId: string, tokenHashes: string[]): Promise<void> {
  if (tokenHashes.length === 0) return;
  await AuthSessionModel.updateMany(
    { userId, clientTokenHash: { $in: tokenHashes }, revokedAt: null },
    { $set: { revokedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function assertActiveAuthSession(userId: string, credential: string): Promise<AuthSessionDoc> {
  const session = (await AuthSessionModel.findOne({
    userId,
    credentialHash: hashAuthCredential(credential),
    revokedAt: null,
  }).lean()) as AuthSessionDoc | null;
  if (!session) {
    throw new AuthSessionError("会话不存在或已撤销", "SESSION_REVOKED");
  }
  return session;
}

export async function touchAuthSession(userId: string, credential: string, metadata: AuthSessionMetadata = {}): Promise<void> {
  const now = new Date();
  const normalized = getAuthSessionMetadataFromInput(metadata as AuthSessionCreateInput);
  const update: Record<string, unknown> = {
    lastActivityAt: now,
    updatedAt: now,
    ipAddress: normalized.ipAddress,
    userAgent: normalized.userAgent,
  };
  if (metadata.deviceName) update.deviceName = normalized.deviceName;
  if (metadata.platform) update.platform = normalized.platform;
  if (metadata.clientType) update.clientType = normalized.clientType;
  if (metadata.deviceId) update.deviceId = normalized.deviceId;
  await AuthSessionModel.updateOne(
    { userId, credentialHash: hashAuthCredential(credential), revokedAt: null },
    { $set: update },
  );
}

function toIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

export async function listAuthDevices(userId: string, currentCredential?: string): Promise<AuthDeviceView[]> {
  const docs = (await AuthSessionModel.find({ userId }).sort({ lastActivityAt: -1 }).lean()) as AuthSessionDoc[];
  const currentHash = currentCredential ? hashAuthCredential(currentCredential) : null;
  const groups = new Map<string, AuthDeviceView>();
  for (const doc of docs) {
    const current = doc.credentialHash === currentHash && !doc.revokedAt;
    const session: AuthSessionView = {
      sessionId: doc.sessionId,
      deviceKey: doc.deviceKey,
      deviceId: doc.deviceId,
      deviceName: doc.deviceName,
      platform: doc.platform,
      clientType: doc.clientType,
      recentActivityAt: doc.lastActivityAt.toISOString(),
      ip: doc.ipAddress,
      ipLocation: doc.ipLocation,
      current,
      revoked: Boolean(doc.revokedAt),
      authKind: doc.authKind,
      oauthClientId: doc.oauthClientId,
      createdAt: doc.createdAt.toISOString(),
      revokedAt: toIso(doc.revokedAt),
    };
    const group = groups.get(doc.deviceKey);
    if (!group) {
      groups.set(doc.deviceKey, {
        deviceKey: doc.deviceKey,
        deviceId: doc.deviceId,
        deviceName: doc.deviceName,
        platform: doc.platform,
        clientType: doc.clientType,
        recentActivityAt: session.recentActivityAt,
        ip: doc.ipAddress,
        ipLocation: doc.ipLocation,
        current,
        revoked: Boolean(doc.revokedAt),
        sessions: [session],
      });
      continue;
    }
    group.sessions.push(session);
    group.current ||= current;
    group.revoked = group.sessions.every((item) => item.revoked);
  }
  return [...groups.values()];
}

export async function revokeAuthDevice(userId: string, deviceKey: string, currentCredential?: string): Promise<{ revoked: number }> {
  const docs = (await AuthSessionModel.find({ userId, deviceKey }).lean()) as AuthSessionDoc[];
  if (docs.length === 0) throw new AuthSessionError("设备会话不存在", "SESSION_NOT_FOUND");
  const currentHash = currentCredential ? hashAuthCredential(currentCredential) : null;
  if (currentHash && docs.some((doc) => doc.credentialHash === currentHash && !doc.revokedAt)) {
    throw new AuthSessionError("当前会话不可撤销", "CURRENT_SESSION_PROTECTED");
  }
  const now = new Date();
  const activeDocs = docs.filter((doc) => !doc.revokedAt);
  if (activeDocs.length === 0) return { revoked: 0 };
  const oauthTokenIds = activeDocs.map((doc) => doc.oauthTokenId).filter((value): value is string => Boolean(value));
  const clientTokenHashes = activeDocs.map((doc) => doc.clientTokenHash).filter((value): value is string => Boolean(value));
  const result = await AuthSessionModel.updateMany(
    { userId, deviceKey, revokedAt: null },
    { $set: { revokedAt: now, updatedAt: now } },
  );
  if (oauthTokenIds.length) {
    await OAuthTokenModel.updateMany({ userId, tokenId: { $in: oauthTokenIds } }, { $set: { revokedAt: now, updatedAt: now } });
  }
  if (clientTokenHashes.length) {
    const mobileLoginService = await import("./mobileLoginService");
    await mobileLoginService.revokeClientLoginTokensByHashes({ userId, tokenHashes: clientTokenHashes });
  }
  return { revoked: Number(result.modifiedCount || 0) };
}
