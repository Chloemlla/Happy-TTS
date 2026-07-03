import { AccountIdentityModel, type AccountIdentityDoc, type AccountIdentityProvider } from "../models/accountIdentityModel";
import { config } from "../config/config";
import { createMergePreviewSession, getPendingMergeSessionForUser, type AccountMergePreview } from "./accountMergeService";
import { AuditLogService } from "./auditLogService";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";

export type LinkedAccountStatus = "bound" | "unbound" | "merge_required" | "conflict";

export interface AccountProviderProfile {
  provider: AccountIdentityProvider;
  providerUserId: string;
  providerEmail?: string;
  providerUsername?: string;
  avatarUrl?: string;
}

export interface ProfileSyncOptions {
  username?: boolean;
  avatar?: boolean;
}

export interface LinkedAccountView {
  provider: AccountIdentityProvider;
  label: string;
  status: LinkedAccountStatus;
  providerUserId?: string;
  providerEmail?: string | null;
  providerUsername?: string | null;
  avatarUrl?: string | null;
  linkedAt?: string;
  lastUsedAt?: string | null;
  canBind: boolean;
  canUnlink: boolean;
  mergeToken?: string;
  mergePreview?: AccountMergePreview;
  conflictReason?: string;
}

export interface BindIdentityResult {
  success: true;
  status: "bound" | "refreshed" | "merge_required" | "conflict";
  account?: LinkedAccountView;
  mergeToken?: string;
  mergePreview?: AccountMergePreview;
  conflictReason?: string;
}

export interface IdentityAuditActor {
  userId: string;
  username: string;
  role: string;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
  requestId?: string;
}

const SUPPORTED_PROVIDERS: AccountIdentityProvider[] = ["google", "linuxdo"];
const RESERVED_USERNAMES = new Set(["admin", "administrator", "root", "system", "test"]);

function assertProvider(provider: string): AccountIdentityProvider {
  if (!SUPPORTED_PROVIDERS.includes(provider as AccountIdentityProvider)) {
    throw new Error("不支持的第三方身份提供商");
  }
  return provider as AccountIdentityProvider;
}

export function isAccountIdentityProvider(provider: unknown): provider is AccountIdentityProvider {
  return typeof provider === "string" && SUPPORTED_PROVIDERS.includes(provider as AccountIdentityProvider);
}

function providerLabel(provider: AccountIdentityProvider): string {
  return provider === "google" ? "Google" : "Linux.do";
}

function normalizeProfile(profile: AccountProviderProfile): AccountProviderProfile {
  const provider = assertProvider(profile.provider);
  const providerUserId = String(profile.providerUserId || "").trim();
  if (!providerUserId) {
    throw new Error("第三方账号缺少稳定用户 ID");
  }

  return {
    provider,
    providerUserId,
    providerEmail: typeof profile.providerEmail === "string" ? profile.providerEmail.trim().toLowerCase() : undefined,
    providerUsername: typeof profile.providerUsername === "string" ? profile.providerUsername.trim() : undefined,
    avatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl.trim() : undefined,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

function sanitizeProviderUsername(rawUsername: string | undefined, provider: AccountIdentityProvider, fallbackId: string): string {
  const prefix = provider === "google" ? "google" : "linuxdo";
  const fallback = `${prefix}_${fallbackId}`.slice(0, 20);
  const normalized =
    (rawUsername || fallback)
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20) || fallback;

  let candidate = normalized;

  if (candidate.length < 3) {
    candidate = `${provider === "google" ? "gg" : "ld"}_${fallbackId}`
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .slice(0, 20);
  }

  if (RESERVED_USERNAMES.has(candidate.toLowerCase())) {
    candidate = `${candidate.slice(0, 17)}_${provider === "google" ? "gg" : "ld"}`.slice(0, 20);
  }

  if (candidate.length < 3) {
    candidate = fallback;
  }

  return candidate;
}

async function getAvailableSynapseUsername(
  user: User,
  profile: AccountProviderProfile,
): Promise<string | undefined> {
  const baseUsername = sanitizeProviderUsername(profile.providerUsername, profile.provider, profile.providerUserId);
  let candidate = baseUsername;
  let suffix = 1;

  while (suffix <= 9999) {
    const existing = await UserStorage.getUserByUsername(candidate);
    if (!existing || existing.id === user.id) {
      return candidate;
    }

    const suffixText = `_${suffix}`;
    candidate = `${baseUsername.slice(0, Math.max(3, 20 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }

  logger.warn("[AccountIdentity] 第三方昵称无法分配为唯一用户名，跳过同步", {
    userId: user.id,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
  });
  return undefined;
}

async function canWriteLegacyLinuxDoId(user: User, linuxdoId: string): Promise<boolean> {
  if (user.linuxdoId === linuxdoId) {
    return true;
  }

  const legacyUser = await UserStorage.getUserByLinuxDoId(linuxdoId);
  if (!legacyUser || legacyUser.id === user.id) {
    return true;
  }

  logger.warn("[AccountIdentity] Linux.do 旧字段已被其他用户占用，跳过旧字段写入", {
    userId: user.id,
    holderUserId: legacyUser.id,
    linuxdoId,
  });
  return false;
}

export async function buildProviderUserUpdates(
  user: User,
  profile: AccountProviderProfile,
  syncOptions: ProfileSyncOptions = {},
): Promise<Partial<User>> {
  const normalized = normalizeProfile(profile);
  const updates: Partial<User> = {};

  if (normalized.provider === "linuxdo") {
    if (await canWriteLegacyLinuxDoId(user, normalized.providerUserId)) {
      updates.linuxdoId = normalized.providerUserId;
    }
    updates.linuxdoUsername = normalized.providerUsername;
    updates.linuxdoAvatarUrl = normalized.avatarUrl;
  }

  if (syncOptions.username) {
    const username = await getAvailableSynapseUsername(user, normalized);
    if (username && username !== user.username) {
      updates.username = username;
    }
  }

  if (syncOptions.avatar !== false && normalized.avatarUrl) {
    updates.avatarUrl = normalized.avatarUrl;
  }

  if (!user.authProvider) {
    updates.authProvider = normalized.provider;
  }

  return updates;
}

function toLinkedAccountView(
  provider: AccountIdentityProvider,
  identity: AccountIdentityDoc | null,
  pendingMerge?: { token: string; preview: AccountMergePreview } | null,
): LinkedAccountView {
  if (pendingMerge) {
    return {
      provider,
      label: providerLabel(provider),
      status: "merge_required",
      canBind: false,
      canUnlink: false,
      mergeToken: pendingMerge.token,
      mergePreview: pendingMerge.preview,
    };
  }

  if (!identity || identity.status !== "active") {
    return {
      provider,
      label: providerLabel(provider),
      status: "unbound",
      canBind: true,
      canUnlink: false,
    };
  }

  return {
    provider,
    label: providerLabel(provider),
    status: "bound",
    providerUserId: identity.providerUserId,
    providerEmail: identity.providerEmail,
    providerUsername: identity.providerUsername,
    avatarUrl: identity.avatarUrl,
    linkedAt: identity.linkedAt?.toISOString?.() || String(identity.linkedAt),
    lastUsedAt: identity.lastUsedAt ? identity.lastUsedAt.toISOString() : null,
    canBind: true,
    canUnlink: true,
  };
}

async function updateLegacyProviderFields(
  user: User,
  profile: AccountProviderProfile,
  syncOptions: ProfileSyncOptions = {},
): Promise<void> {
  const updates = await buildProviderUserUpdates(user, profile, syncOptions);

  if (Object.keys(updates).length > 0) {
    await UserStorage.updateUser(user.id, updates);
  }
}

async function clearLegacyProviderFields(user: User, provider: AccountIdentityProvider): Promise<void> {
  if (provider !== "linuxdo") return;

  await UserStorage.updateUser(user.id, {
    linuxdoId: undefined,
    linuxdoUsername: undefined,
    linuxdoAvatarUrl: undefined,
  } as Partial<User>);
}

export async function backfillLegacyLinuxDoIdentityForUser(user: User): Promise<void> {
  const linuxdoId = typeof user.linuxdoId === "string" ? user.linuxdoId.trim() : "";
  if (!linuxdoId) return;

  try {
    const existingIdentity = await AccountIdentityModel.findOne({
      provider: "linuxdo",
      providerUserId: linuxdoId,
    }).lean<AccountIdentityDoc>();

    if (existingIdentity && existingIdentity.userId !== user.id) {
      logger.warn("[AccountIdentity] Linux.do 旧字段与账号身份不一致，跳过回填", {
        userId: user.id,
        identityUserId: existingIdentity.userId,
        linuxdoId,
      });
      return;
    }

    await AccountIdentityModel.findOneAndUpdate(
      { provider: "linuxdo", providerUserId: linuxdoId, userId: user.id },
      {
        $setOnInsert: {
          provider: "linuxdo",
          providerUserId: linuxdoId,
          userId: user.id,
          linkedAt: user.createdAt ? new Date(user.createdAt) : new Date(),
        },
        $set: {
          providerEmail: user.email || null,
          providerUsername: user.linuxdoUsername || user.username || null,
          avatarUrl: user.linuxdoAvatarUrl || user.avatarUrl || null,
          status: "active",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      logger.warn("[AccountIdentity] Linux.do 旧字段已存在账号身份，跳过回填", { userId: user.id, linuxdoId });
      return;
    }
    logger.warn("[AccountIdentity] Linux.do 旧字段回填失败", { userId: user.id, linuxdoId, error });
  }
}

export async function backfillLegacyLinuxDoIdentityByProviderUserId(providerUserId: string): Promise<void> {
  const legacyUser = await UserStorage.getUserByLinuxDoId(providerUserId);
  if (legacyUser) {
    await backfillLegacyLinuxDoIdentityForUser(legacyUser);
  }
}

export async function findAccountIdentity(provider: AccountIdentityProvider, providerUserId: string) {
  if (provider === "linuxdo") {
    await backfillLegacyLinuxDoIdentityByProviderUserId(providerUserId);
  }

  return AccountIdentityModel.findOne({ provider, providerUserId }).lean<AccountIdentityDoc>();
}

export async function findUserByProviderIdentity(
  provider: AccountIdentityProvider,
  providerUserId: string,
): Promise<User | null> {
  const identity = await findAccountIdentity(provider, providerUserId);
  if (!identity || identity.status !== "active") {
    return null;
  }

  return UserStorage.getUserById(identity.userId);
}

export async function upsertIdentityForUser(
  user: User,
  profile: AccountProviderProfile,
  syncOptions: ProfileSyncOptions = {},
): Promise<void> {
  const normalized = normalizeProfile(profile);

  await AccountIdentityModel.findOneAndUpdate(
    { provider: normalized.provider, providerUserId: normalized.providerUserId },
    {
      $setOnInsert: {
        provider: normalized.provider,
        providerUserId: normalized.providerUserId,
        linkedAt: new Date(),
      },
      $set: {
        userId: user.id,
        providerEmail: normalized.providerEmail || null,
        providerUsername: normalized.providerUsername || null,
        avatarUrl: normalized.avatarUrl || null,
        lastUsedAt: new Date(),
        status: "active",
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  await updateLegacyProviderFields(user, normalized, syncOptions);
}

export async function listLinkedAccounts(user: User): Promise<LinkedAccountView[]> {
  await backfillLegacyLinuxDoIdentityForUser(user);

  const identities = await AccountIdentityModel.find({
    userId: user.id,
    provider: { $in: SUPPORTED_PROVIDERS },
    status: "active",
  }).lean<AccountIdentityDoc[]>();

  return SUPPORTED_PROVIDERS.map((provider) => {
    const identity = (identities as AccountIdentityDoc[]).find((item: AccountIdentityDoc) => item.provider === provider) || null;
    const pendingMerge = getPendingMergeSessionForUser(user.id, provider);
    return toLinkedAccountView(provider, identity, pendingMerge);
  });
}

export async function bindProviderIdentityToUser(params: {
  targetUser: User;
  profile: AccountProviderProfile;
  syncProfile?: ProfileSyncOptions;
  actor?: IdentityAuditActor;
}): Promise<BindIdentityResult> {
  const normalized = normalizeProfile(params.profile);
  const targetUser = params.targetUser;

  if ((targetUser as any).accountStatus === "suspended") {
    throw new Error("账户已被封停，不能绑定第三方账号");
  }

  await backfillLegacyLinuxDoIdentityForUser(targetUser);

  const targetProviderIdentity = await AccountIdentityModel.findOne({
    userId: targetUser.id,
    provider: normalized.provider,
    status: "active",
  }).lean<AccountIdentityDoc>();

  if (targetProviderIdentity && targetProviderIdentity.providerUserId !== normalized.providerUserId) {
    return {
      success: true,
      status: "conflict",
      conflictReason: `${providerLabel(normalized.provider)} 已绑定到当前账号的另一个身份，暂不支持同一提供商绑定多个身份。`,
    };
  }

  const existingIdentity = await findAccountIdentity(normalized.provider, normalized.providerUserId);
  if (!existingIdentity || existingIdentity.status === "revoked") {
    await upsertIdentityForUser(targetUser, normalized, params.syncProfile);
    await writeIdentityAudit(params.actor, targetUser, normalized, "account.identity.bind", "success");
    const accounts = await listLinkedAccounts(targetUser);
    return {
      success: true,
      status: "bound",
      account: accounts.find((item) => item.provider === normalized.provider),
    };
  }

  if (existingIdentity.userId === targetUser.id) {
    await upsertIdentityForUser(targetUser, normalized, params.syncProfile);
    await writeIdentityAudit(params.actor, targetUser, normalized, "account.identity.refresh", "success");
    const accounts = await listLinkedAccounts(targetUser);
    return {
      success: true,
      status: "refreshed",
      account: accounts.find((item) => item.provider === normalized.provider),
    };
  }

  const sourceUser = await UserStorage.getUserById(existingIdentity.userId);
  if (!sourceUser) {
    await upsertIdentityForUser(targetUser, normalized);
    const accounts = await listLinkedAccounts(targetUser);
    return {
      success: true,
      status: "bound",
      account: accounts.find((item) => item.provider === normalized.provider),
    };
  }

  const { token, preview } = await createMergePreviewSession({
    sourceUserId: sourceUser.id,
    targetUserId: targetUser.id,
    provider: normalized.provider,
    providerUserId: normalized.providerUserId,
  });

  await writeIdentityAudit(params.actor, targetUser, normalized, "account.identity.merge_preview", "success", {
    sourceUserId: sourceUser.id,
    mergeToken: token,
  });

  return {
    success: true,
    status: "merge_required",
    mergeToken: token,
    mergePreview: preview,
  };
}

export async function unlinkProviderIdentity(params: {
  user: User;
  provider: AccountIdentityProvider;
  actor?: IdentityAuditActor;
}): Promise<LinkedAccountView[]> {
  const provider = assertProvider(params.provider);
  const identity = await AccountIdentityModel.findOne({ userId: params.user.id, provider, status: "active" });

  if (!identity) {
    throw new Error(`${providerLabel(provider)} 尚未绑定`);
  }

  await identity.updateOne({
    $set: {
      status: "revoked",
      lastUsedAt: new Date(),
    },
  });
  await clearLegacyProviderFields(params.user, provider);
  await writeIdentityAudit(
    params.actor,
    params.user,
    {
      provider,
      providerUserId: identity.providerUserId,
      providerEmail: identity.providerEmail || undefined,
      providerUsername: identity.providerUsername || undefined,
      avatarUrl: identity.avatarUrl || undefined,
    },
    "account.identity.unlink",
    "success",
  );

  const updatedUser = (await UserStorage.getUserById(params.user.id)) || params.user;
  return listLinkedAccounts(updatedUser);
}

async function writeIdentityAudit(
  actor: IdentityAuditActor | undefined,
  user: User,
  profile: AccountProviderProfile,
  action: string,
  result: "success" | "failure",
  detail?: Record<string, unknown>,
): Promise<void> {
  if (!actor) return;

  await AuditLogService.log({
    requestId: actor.requestId,
    userId: actor.userId,
    username: actor.username,
    role: actor.role,
    action,
    module: "auth",
    targetId: user.id,
    targetName: user.username,
    result,
    detail: {
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      providerEmail: profile.providerEmail,
      providerUsername: profile.providerUsername,
      ...detail,
    },
    ip: actor.ip,
    userAgent: actor.userAgent,
    path: actor.path,
    method: actor.method,
  });
}

export function buildProviderBindRedirect(params: {
  status: BindIdentityResult["status"];
  mergeToken?: string;
  error?: string;
}): string {
  const redirectParams = new URLSearchParams({ intent: "bind", status: params.status });
  if (params.mergeToken) {
    redirectParams.set("mergeToken", params.mergeToken);
  }
  if (params.error) {
    redirectParams.set("error", params.error);
  }
  return `${config.linuxdo.frontendCallbackUrl}?${redirectParams.toString()}`;
}
