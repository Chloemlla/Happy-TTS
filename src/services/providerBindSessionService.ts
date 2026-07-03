import crypto from "node:crypto";
import type { AccountIdentityProvider } from "../models/accountIdentityModel";
import {
  type AccountProviderProfile,
  type BindIdentityResult,
  bindProviderIdentityToUser,
  upsertIdentityForUser,
  type ProfileSyncOptions,
} from "./accountIdentityService";
import { signLoginToken } from "../utils/authToken";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

const BIND_SESSION_TTL_MS = 5 * 60 * 1000;

interface ProviderBindSessionRecord {
  profile: AccountProviderProfile;
  expiresAt: number;
}

export interface ProviderBindSessionView {
  sessionToken: string;
  provider: AccountIdentityProvider;
  providerLabel: string;
  providerEmail: string | null;
  providerUsername: string | null;
  avatarUrl: string | null;
  expiresAt: string;
}

export interface ProviderLoginPayload {
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
  isNewUser: false;
  provider: AccountIdentityProvider;
}

export interface ProviderBindConfirmResult extends Partial<ProviderLoginPayload> {
  success: true;
  status: BindIdentityResult["status"];
  provider: AccountIdentityProvider;
  account?: BindIdentityResult["account"];
  mergeToken?: string;
  mergePreview?: BindIdentityResult["mergePreview"];
  conflictReason?: string;
}

const providerBindSessions = new Map<string, ProviderBindSessionRecord>();

function cleanupExpiredBindSessions(now = Date.now()): void {
  for (const [token, record] of providerBindSessions.entries()) {
    if (record.expiresAt <= now) {
      providerBindSessions.delete(token);
    }
  }
}

function providerLabel(provider: AccountIdentityProvider): string {
  return provider === "google" ? "Google" : "Linux.do";
}

function toSessionView(token: string, record: ProviderBindSessionRecord): ProviderBindSessionView {
  return {
    sessionToken: token,
    provider: record.profile.provider,
    providerLabel: providerLabel(record.profile.provider),
    providerEmail: record.profile.providerEmail || null,
    providerUsername: record.profile.providerUsername || null,
    avatarUrl: record.profile.avatarUrl || null,
    expiresAt: new Date(record.expiresAt).toISOString(),
  };
}

function toLoginPayload(user: User, provider: AccountIdentityProvider): ProviderLoginPayload {
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
    isNewUser: false,
    provider,
  };
}

export function issueProviderBindSession(profile: AccountProviderProfile): ProviderBindSessionView {
  cleanupExpiredBindSessions();

  const token = crypto.randomBytes(32).toString("base64url");
  const record: ProviderBindSessionRecord = {
    profile,
    expiresAt: Date.now() + BIND_SESSION_TTL_MS,
  };
  providerBindSessions.set(token, record);

  return toSessionView(token, record);
}

export function getProviderBindSessionView(sessionToken: string): ProviderBindSessionView | null {
  cleanupExpiredBindSessions();

  const record = providerBindSessions.get(sessionToken);
  if (!record || record.expiresAt <= Date.now()) {
    providerBindSessions.delete(sessionToken);
    return null;
  }

  return toSessionView(sessionToken, record);
}

export async function createProviderLoginPayloadForUser(
  user: User,
  provider: AccountIdentityProvider,
  clientIp?: string,
): Promise<ProviderLoginPayload> {
  const loginUpdates: Partial<User> = {
    lastLoginIp: clientIp || "unknown",
    lastLoginAt: new Date().toISOString(),
  };
  const updatedUser = (await UserStorage.updateUser(user.id, loginUpdates)) || {
    ...user,
    ...loginUpdates,
  };

  return toLoginPayload(updatedUser, provider);
}

export async function completeProviderLoginForBoundIdentity(params: {
  user: User;
  profile: AccountProviderProfile;
  clientIp?: string;
}): Promise<ProviderLoginPayload> {
  if ((params.user as any).accountStatus === "suspended") {
    throw new Error("账户已被封停");
  }

  await upsertIdentityForUser(params.user, params.profile);
  const refreshedUser = (await UserStorage.getUserById(params.user.id)) || params.user;
  return createProviderLoginPayloadForUser(refreshedUser, params.profile.provider, params.clientIp);
}

export async function confirmProviderBindSession(params: {
  sessionToken: string;
  identifier: string;
  password: string;
  acceptedTerms: boolean;
  syncProfile?: ProfileSyncOptions;
  clientIp?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  requestId?: string;
}): Promise<ProviderBindConfirmResult> {
  cleanupExpiredBindSessions();

  if (!params.acceptedTerms) {
    throw new Error("请先同意服务条款、使用政策、服务专项条款和支持地区说明");
  }

  const record = providerBindSessions.get(params.sessionToken);
  if (!record || record.expiresAt <= Date.now()) {
    providerBindSessions.delete(params.sessionToken);
    throw new Error("第三方登录绑定会话已过期，请返回登录页重试");
  }

  const identifier = typeof params.identifier === "string" ? params.identifier.trim() : "";
  if (!identifier || !params.password) {
    throw new Error("请输入已有账号和密码");
  }

  const user = await UserStorage.authenticateUser(identifier, params.password);
  if (!user) {
    throw new Error("用户名/邮箱或密码错误");
  }
  if ((user as any).accountStatus === "suspended") {
    throw new Error("账户已被封停");
  }

  const bindResult = await bindProviderIdentityToUser({
    targetUser: user,
    profile: record.profile,
    syncProfile: params.syncProfile,
    actor: {
      userId: user.id,
      username: user.username,
      role: user.role,
      ip: params.clientIp || "unknown",
      userAgent: params.userAgent,
      path: params.path,
      method: params.method,
      requestId: params.requestId,
    },
  });

  if (bindResult.status === "conflict") {
    logger.warn("[ProviderBind] 绑定目标账号已有同提供商身份", {
      userId: user.id,
      provider: record.profile.provider,
    });
    return {
      success: true,
      status: bindResult.status,
      provider: record.profile.provider,
      conflictReason: bindResult.conflictReason,
    };
  }

  providerBindSessions.delete(params.sessionToken);
  const refreshedUser = (await UserStorage.getUserById(user.id)) || user;
  const loginPayload = await createProviderLoginPayloadForUser(
    refreshedUser,
    record.profile.provider,
    params.clientIp,
  );

  return {
    success: true,
    status: bindResult.status,
    account: bindResult.account,
    mergeToken: bindResult.mergeToken,
    mergePreview: bindResult.mergePreview,
    ...loginPayload,
  };
}

export function buildProviderBindPageRedirect(frontendCallbackUrl: string, sessionToken: string): string {
  const url = new URL(frontendCallbackUrl);
  url.pathname = "/auth/provider/bind";
  url.search = new URLSearchParams({ sessionToken }).toString();
  url.hash = "";
  return url.toString();
}

export function resetProviderBindSessionsForTests(): void {
  providerBindSessions.clear();
}
