import validator from "validator";
import type { User as UserType } from "../utils/userStorageTypes";
import { mongoose } from "./mongoService";
import logger from "../utils/logger";
import {
  canDecryptPassword,
  protectPassword,
  verifyPasswordHash,
} from "../utils/passwordSecurity";
import {
  buildAdminUserMatchStage,
  buildAdminUserStatsGroup,
  getAdminUserSortField,
  normalizeAdminUserStats,
  type AdminUserListQueryParams,
  type AdminUserListPageResult,
} from "./adminUserListAggregation";

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    passwordHash: { type: String },
    passwordCiphertext: { type: String },
    passwordIv: { type: String },
    passwordTag: { type: String },
    passwordKeyVersion: { type: String, default: "v1" },
    passwordWrappedDek: { type: String },
    passwordDekId: { type: String },
    role: { type: String, enum: ["user", "admin", "superadmin", "trusted"], default: "user" },
    dailyUsage: { type: Number, default: 0 },
    lastUsageDate: { type: String },
    createdAt: { type: String },
    token: String,
    tokenExpiresAt: Number,
    totpSecret: String,
    totpEnabled: Boolean,
    backupCodes: [String],
    // G2-13: TOTP 已使用的最新 counter，用于重放防护
    lastTotpCounter: Number,
    passkeyEnabled: Boolean,
    passkeyCredentials: [
      {
        id: String,
        name: String,
        credentialID: String,
        credentialPublicKey: String,
        counter: Number,
        createdAt: String,
      },
    ],
    pendingChallenge: String,
    // G2-11: passkey challenge 过期时间戳（TTL ≤ 5 分钟）
    pendingChallengeExpiresAt: Number,
    currentChallenge: String,
    passkeyVerified: Boolean,
    avatarUrl: { type: String }, // 新增头像URL字段
    authProvider: { type: String, enum: ["local", "linuxdo", "google"], default: "local" },
    linuxdoId: { type: String, unique: true, sparse: true },
    linuxdoUsername: { type: String },
    linuxdoAvatarUrl: { type: String },
    // 指纹预约需求持久化
    requireFingerprint: { type: Boolean, default: false },
    requireFingerprintAt: { type: Number, default: 0 },
    // 用户是否已经关闭过一次指纹请求（一生只能关闭一次）
    fingerprintRequestDismissedOnce: { type: Boolean, default: false },
    fingerprintRequestDismissedAt: { type: Number, default: 0 }, // 关闭时间戳
    // 新增：指纹记录（历史）
    fingerprints: [
      {
        id: { type: String },
        ts: { type: Number },
        ua: { type: String },
        ip: { type: String },
        deviceInfo: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    // 上次登录IP和时间（用于异地登录检测）
    lastLoginIp: { type: String },
    lastLoginAt: { type: String },
    // 工单违规处罚相关
    ticketViolationCount: { type: Number, default: 0 },
    ticketBannedUntil: { type: String }, // ISO 日期字符串
    // 翻译权限与账户状态
    isTranslationEnabled: { type: Boolean, default: true },
    translationAccessUntil: { type: String },
    accountStatus: { type: String, enum: ["active", "suspended"], default: "active" },
    disabled: { type: Boolean, default: false },
  },
  { collection: "user_datas" },
);

userSchema.index({ role: 1, createdAt: 1 });

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

// G2-22: 默认公开投影不再带出 totpSecret / backupCodes 等离线 2FA 秘密。
const PUBLIC_USER_SELECT =
  "id username email role avatarUrl authProvider linuxdoId linuxdoUsername linuxdoAvatarUrl totpEnabled passkeyEnabled passkeyCredentials pendingChallenge pendingChallengeExpiresAt currentChallenge passkeyVerified requireFingerprint requireFingerprintAt fingerprintRequestDismissedOnce fingerprintRequestDismissedAt fingerprints lastLoginIp lastLoginAt ticketViolationCount ticketBannedUntil isTranslationEnabled translationAccessUntil accountStatus dailyUsage lastUsageDate createdAt token tokenExpiresAt lastTotpCounter";

// 安全的公开用户字段选择（排除敏感认证凭据），用于 /api/user/me 等普通用户 API
const PUBLIC_USER_SAFE_SELECT =
  "id username email role avatarUrl authProvider linuxdoId linuxdoUsername linuxdoAvatarUrl totpEnabled passkeyEnabled requireFingerprint requireFingerprintAt fingerprintRequestDismissedOnce fingerprintRequestDismissedAt lastLoginIp lastLoginAt ticketViolationCount ticketBannedUntil isTranslationEnabled translationAccessUntil accountStatus dailyUsage lastUsageDate createdAt lastTotpCounter";

// G2-22: 只有明确需要 2FA 秘密的调用方（totpController、passkeyService verify 等）才使用该投影。
const USER_SECRETS_SELECT = `${PUBLIC_USER_SELECT} totpSecret backupCodes`;
const AUTH_USER_SELECT =
  `${PUBLIC_USER_SELECT} password passwordHash passwordCiphertext passwordIv passwordTag passwordKeyVersion passwordWrappedDek passwordDekId totpSecret backupCodes`;
const ADMIN_USER_LIST_PROJECT = {
  _id: 0,
  id: 1,
  username: 1,
  email: 1,
  role: 1,
  avatarUrl: 1,
  authProvider: 1,
  linuxdoId: 1,
  linuxdoUsername: 1,
  linuxdoAvatarUrl: 1,
  totpEnabled: 1,
  passkeyEnabled: 1,
  passkeyVerified: 1,
  requireFingerprint: 1,
  requireFingerprintAt: 1,
  fingerprintRequestDismissedOnce: 1,
  fingerprintRequestDismissedAt: 1,
  lastLoginIp: 1,
  lastLoginAt: 1,
  ticketViolationCount: 1,
  ticketBannedUntil: 1,
  isTranslationEnabled: 1,
  translationAccessUntil: 1,
  accountStatus: 1,
  dailyUsage: 1,
  lastUsageDate: 1,
  createdAt: 1,
  fingerprintCount: { $size: { $ifNull: ["$fingerprints", []] } },
  latestFingerprint: {
    $let: {
      vars: { fingerprints: { $ifNull: ["$fingerprints", []] } },
      in: { $arrayElemAt: ["$$fingerprints", -1] },
    },
  },
};

// 工具函数：彻底删除对象中的avatarBase64字段
function removeAvatarBase64(obj: any) {
  if (obj && typeof obj === "object" && "avatarBase64" in obj) {
    delete obj.avatarBase64;
  }
  return obj;
}

const parsedUserCacheTtlMs = Number(process.env.USER_BY_ID_CACHE_TTL_MS || 10_000);
const USER_BY_ID_CACHE_TTL_MS = Number.isFinite(parsedUserCacheTtlMs)
  ? Math.max(0, Math.min(60_000, parsedUserCacheTtlMs))
  : 10_000;
const parsedUserCacheMax = Number(process.env.USER_BY_ID_CACHE_MAX || 1000);
const USER_BY_ID_CACHE_MAX = Number.isFinite(parsedUserCacheMax)
  ? Math.max(100, Math.min(10_000, Math.floor(parsedUserCacheMax)))
  : 1000;

const userByIdCache = new Map<string, { user: UserType; expiresAt: number }>();

function cloneUser(user: UserType): UserType {
  return { ...user };
}

function getCachedUserById(id: string): UserType | null {
  if (USER_BY_ID_CACHE_TTL_MS <= 0) return null;
  const cached = userByIdCache.get(id);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    userByIdCache.delete(id);
    return null;
  }

  userByIdCache.delete(id);
  userByIdCache.set(id, cached);
  return cloneUser(cached.user);
}

function setCachedUserById(user: UserType): UserType {
  if (!user?.id || USER_BY_ID_CACHE_TTL_MS <= 0) {
    return user;
  }

  if (userByIdCache.size >= USER_BY_ID_CACHE_MAX) {
    const oldestKey = userByIdCache.keys().next().value as string | undefined;
    if (oldestKey) {
      userByIdCache.delete(oldestKey);
    }
  }

  userByIdCache.set(user.id, {
    user: cloneUser(user),
    expiresAt: Date.now() + USER_BY_ID_CACHE_TTL_MS,
  });
  return cloneUser(user);
}

function invalidateCachedUserById(id: string): void {
  userByIdCache.delete(id);
}

export const getAllUsers = async (): Promise<UserType[]> => {
  // G2-22: 默认取安全投影，不携带 totpSecret/backupCodes。
  const docs = await UserModel.find().select(PUBLIC_USER_SELECT).lean();
  return docs.map(removeAvatarBase64) as unknown as UserType[];
};

export const getAdminUserList = async (opts: { includeFingerprints?: boolean } = {}): Promise<UserType[]> => {
  if (opts.includeFingerprints) {
    return getAllUsers();
  }

  const docs = await UserModel.aggregate([{ $project: ADMIN_USER_LIST_PROJECT }]);
  return docs.map(removeAvatarBase64) as unknown as UserType[];
};

// ========== G4-19: 管理端用户列表下推 aggregation ==========
// 筛选/排序/分页/统计 pipeline 构建逻辑在 ./adminUserListAggregation（避免本文件超 800 行）。

export type { AdminUserListQueryParams, AdminUserListPageResult, AdminUserListStats } from "./adminUserListAggregation";

export const getAdminUserListPage = async (
  query: AdminUserListQueryParams,
  includeFingerprints: boolean,
): Promise<AdminUserListPageResult> => {
  const nowIso = new Date().toISOString();
  const match = buildAdminUserMatchStage(query);
  const sortField = getAdminUserSortField(query);
  const sortDir = query.sortOrder === "asc" ? 1 : -1;
  const project = includeFingerprints ? { ...ADMIN_USER_LIST_PROJECT, fingerprints: 1 } : ADMIN_USER_LIST_PROJECT;

  const facetResults = await UserModel.aggregate([
    { $match: match },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        filteredStats: [{ $group: buildAdminUserStatsGroup(nowIso) }],
        data: [
          { $sort: { [sortField]: sortDir } },
          { $skip: (query.page - 1) * query.pageSize },
          { $limit: query.pageSize },
          { $project: project },
        ],
      },
    },
  ]);

  const facet = facetResults[0] || {};
  const total = Number((facet as any).metadata?.[0]?.total || 0);
  const filteredStats = normalizeAdminUserStats((facet as any).filteredStats?.[0]);
  const users = ((facet as any).data || []).map(removeAvatarBase64) as unknown as UserType[];

  const allStatsResults = await UserModel.aggregate([{ $group: buildAdminUserStatsGroup(nowIso) }]);
  const stats = normalizeAdminUserStats(allStatsResults[0]);

  return { users, total, stats, filteredStats };
};

export const getAllUsersAuth = async (): Promise<UserType[]> => {
  const docs = await UserModel.find().select(AUTH_USER_SELECT).lean();
  return docs.map(removeAvatarBase64) as unknown as UserType[];
};

export const getUserById = async (id: string): Promise<UserType | null> => {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("非法的用户ID");
  }
  const cached = getCachedUserById(id);
  if (cached) {
    return cached;
  }

  const doc = await UserModel.findOne({ id })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return setCachedUserById(removeAvatarBase64(doc) as unknown as UserType);
};

export const getUserByUsername = async (username: string): Promise<UserType | null> => {
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error("非法的用户名");
  }
  const doc = await UserModel.findOne({ username })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUserByLinuxDoId = async (linuxdoId: string): Promise<UserType | null> => {
  if (typeof linuxdoId !== "string" || !linuxdoId.trim()) {
    return null;
  }

  const doc = await UserModel.findOne({ linuxdoId: linuxdoId.trim() })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUserByEmail = async (email: string): Promise<UserType | null> => {
  // 防注入：只允许字符串类型且为合法邮箱
  if (typeof email !== "string") return null;
  const safeEmail = email.trim();
  if (!validator.isEmail(safeEmail)) return null;
  const doc = await UserModel.findOne({ email: safeEmail })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUserByEmailCaseInsensitive = async (email: string): Promise<UserType | null> => {
  // 防注入：只允许字符串类型且为合法邮箱
  if (typeof email !== "string") return null;
  const safeEmail = email.trim();
  if (!safeEmail || !validator.isEmail(safeEmail)) return null;

  // 精确匹配走 email 唯一索引；只有大小写不一致的历史数据才落到不可走索引的正则查询
  const exact = await UserModel.findOne({ email: safeEmail })
    .select(PUBLIC_USER_SELECT)
    .lean();
  if (exact) return removeAvatarBase64(exact) as unknown as UserType;

  const escaped = safeEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, (ch) => `\\${ch}`);
  const doc = await UserModel.findOne({ email: new RegExp(`^${escaped}$`, "i") })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUserByToken = async (token: string): Promise<UserType | null> => {
  if (typeof token !== "string" || !token) {
    return null;
  }
  const doc = await UserModel.findOne({ token })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
};

export const getUsersByIds = async (ids: string[]): Promise<UserType[]> => {
  if (!ids || ids.length === 0) return [];
  const docs = await UserModel.find({ id: { $in: ids } })
    .select(PUBLIC_USER_SELECT)
    .lean();
  return docs.map((d) => removeAvatarBase64(d)) as unknown as UserType[];
};

export const bulkUpdateUsers = async (ops: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }>): Promise<void> => {
  if (!ops || ops.length === 0) return;
  await UserModel.bulkWrite(ops as any);
  // G2-31: 批量写会绕过 updateUser 的失效逻辑，直接清空整个缓存，
  // 避免被封停/降权的账号在最长 10 秒内仍从缓存读到旧状态。
  userByIdCache.clear();
};

export const createUser = async (user: UserType): Promise<UserType> => {
  const { password, ...rest } = user;
  const protectedPassword = await protectPassword(user.id, password || "");
  const doc = await UserModel.create({
    ...rest,
    ...protectedPassword,
    password: undefined,
  });
  return setCachedUserById(removeAvatarBase64(doc.toObject()) as unknown as UserType);
};

export const updateUser = async (id: string, updates: Partial<UserType>): Promise<UserType | null> => {
  // 只允许字符串id，且不能包含特殊字符
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("非法的用户ID");
  }
  const sanitizedUpdates = { ...updates } as Partial<UserType>;
  if (typeof sanitizedUpdates.password === "string" && sanitizedUpdates.password.trim()) {
    Object.assign(sanitizedUpdates, await protectPassword(id, sanitizedUpdates.password.trim()));
  }
  delete sanitizedUpdates.password;

  const updateOps: any = { $set: {}, $unset: { password: "" } };
  for (const key in sanitizedUpdates) {
    if ((sanitizedUpdates as any)[key] === undefined) {
      if (!updateOps.$unset) updateOps.$unset = {};
      updateOps.$unset[key] = "";
    } else if (key !== "avatarBase64") {
      updateOps.$set[key] = (sanitizedUpdates as any)[key];
    }
  }
  // 如果$set为空对象，删除它
  if (Object.keys(updateOps.$set).length === 0) delete updateOps.$set;
  if (process.env.USER_SERVICE_DEBUG_LOGS === "true") {
    console.log("[updateUser] 更新条件:", { id }, "更新内容:", updateOps);
  }
  invalidateCachedUserById(id);
  const doc = await UserModel.findOneAndUpdate({ id }, updateOps, { returnDocument: "after" })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (process.env.USER_SERVICE_DEBUG_LOGS === "true") {
    console.log("[updateUser] 更新后文档:", removeAvatarBase64(doc));
  }
  return doc ? setCachedUserById(removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const deleteUser = async (id: string): Promise<void> => {
  invalidateCachedUserById(id);

  // G2-30: 级联集合及其归属字段名（逐集合修正，避免统一用 userId 导致静默失效）。
  // audit_logs 已从级联删除中移除——删号应脱敏保留审计日志，保证可追溯。
  const cascadeCollections: Array<{ collection: string; field: string }> = [
    { collection: "access_tokens", field: "userId" },
    { collection: "auth_sessions", field: "userId" },
    { collection: "verification_tokens", field: "userId" },
    { collection: "api_keys", field: "userId" },
    { collection: "api_key_billing_events", field: "userId" },
    { collection: "bilibili_account_bindings", field: "userId" },
    { collection: "bilibili_sync", field: "userId" },
    { collection: "nexai_sync", field: "userId" },
    { collection: "nexai_sync_v2_records", field: "userId" },
    { collection: "collaboration_sessions", field: "userId" },
    { collection: "invitations", field: "userId" },
    { collection: "workspaces", field: "creatorId" },
    { collection: "voice_projects", field: "ownerId" },
    { collection: "linuxdo_credit_orders", field: "userId" },
    { collection: "device_trackings", field: "userId" },
    { collection: "tickets", field: "userId" },
    { collection: "translation_logs", field: "userId" },
    { collection: "user_preferences", field: "userId" },
    { collection: "recommendation_history", field: "userId" },
    { collection: "security_events", field: "userId" },
    { collection: "oauth_clients", field: "ownerUserId" },
    { collection: "oauth_grants", field: "userId" },
    { collection: "oauth_tokens", field: "userId" },
    { collection: "oauth_authorization_codes", field: "userId" },
    { collection: "account_identities", field: "userId" },
    { collection: "artifacts", field: "userId" },
    { collection: "cdks", field: "userId" },
    { collection: "registration_invites", field: "userId" },
    { collection: "short_urls", field: "userId" },
  ];

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("数据库连接不可用");
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const results = await Promise.all(
        cascadeCollections.map(({ collection, field }) =>
          db.collection(collection).deleteMany({ [field]: id }, { session }),
        ),
      );
      const unacknowledged = results.filter((result) => result.acknowledged === false);
      if (unacknowledged.length > 0) {
        throw new Error(`级联清理失败: ${unacknowledged.length} 个集合未被确认`);
      }
      await UserModel.deleteOne({ id }).session(session);
    });
  } finally {
    await session.endSession();
  }
};

export const getUserAuthById = async (id: string): Promise<UserType | null> => {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("非法的用户ID");
  }
  const doc = await UserModel.findOne({ id }).select(AUTH_USER_SELECT).lean();
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

// G2-22: 明确需要 TOTP 秘密/恢复码的调用方专用投影（totpController、passkeyService verify 等）。
export const getUserSecretsById = async (id: string): Promise<UserType | null> => {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("非法的用户ID");
  }
  const doc = await UserModel.findOne({ id }).select(USER_SECRETS_SELECT).lean();
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const getUserAuthByUsername = async (username: string): Promise<UserType | null> => {
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error("非法的用户名");
  }
  const doc = await UserModel.findOne({ username }).select(AUTH_USER_SELECT).lean();
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const getUserAuthByEmail = async (email: string): Promise<UserType | null> => {
  if (typeof email !== "string") return null;
  const safeEmail = email.trim();
  if (!validator.isEmail(safeEmail)) return null;
  const doc = await UserModel.findOne({ email: safeEmail }).select(AUTH_USER_SELECT).lean();
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const getPrimaryAdminAuthUser = async () => {
  // 按 createdAt 升序取最早的管理员，与旧的“getAllUsers() 里第一个 admin”保持一致，
  // 并且完全走 { role: 1, createdAt: 1 } 索引。
  const doc = await UserModel.findOne({ role: { $in: ["admin", "superadmin"] } })
    .sort({ createdAt: 1 })
    .select(AUTH_USER_SELECT)
    .lean();
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const verifyAndMigrateUserPassword = async (
  user: UserType,
  password: string,
): Promise<{ valid: boolean; migrated: boolean; user: UserType | null }> => {
  if (await verifyPasswordHash(user.passwordHash, password)) {
    if (canDecryptPassword(user)) {
      return { valid: true, migrated: false, user };
    }

    const protectedPassword = await protectPassword(user.id, password);
    // G2-31: 直接 findOneAndUpdate 绕过 updateUser 的失效逻辑，手动失效缓存。
    invalidateCachedUserById(user.id);
    const updated = await UserModel.findOneAndUpdate(
      { id: user.id },
      {
        $set: protectedPassword,
        $unset: { password: "" },
      },
      { returnDocument: "after" },
    )
      .select(AUTH_USER_SELECT)
      .lean();

    return {
      valid: true,
      migrated: true,
      user: updated ? (removeAvatarBase64(updated) as unknown as UserType) : user,
    };
  }

  if (user.password && user.password === password) {
    const protectedPassword = await protectPassword(user.id, password);
    // G2-31: 同上，手动失效缓存。
    invalidateCachedUserById(user.id);
    const updated = await UserModel.findOneAndUpdate(
      { id: user.id },
      {
        $set: protectedPassword,
        $unset: { password: "" },
      },
      { returnDocument: "after" },
    )
      .select(AUTH_USER_SELECT)
      .lean();

    return {
      valid: true,
      migrated: true,
      user: updated ? (removeAvatarBase64(updated) as unknown as UserType) : user,
    };
  }

  return { valid: false, migrated: false, user: null };
};

export const incrementUserDailyUsageAtomic = async (
  id: string,
  dailyLimit: number,
): Promise<{ success: boolean; user: UserType | null }> => {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  // G2-29: 单条 findOneAndUpdate + 聚合管道，一次完成「跨日判断 + 增量/重置 + 管理员豁免」。
  // 管理员通过 role 条件排除在本次更新外；并发请求在同一时刻只有一个能匹配并更新。
  const todayPrefix = new RegExp(`^${today}`);
  const updated = await UserModel.findOneAndUpdate(
    {
      id,
      role: { $nin: ["admin", "superadmin"] },
      $or: [{ lastUsageDate: { $not: todayPrefix } }, { dailyUsage: { $lt: dailyLimit } }],
    },
    [
      {
        $set: {
          dailyUsage: {
            $cond: [
              { $regexMatch: { input: { $ifNull: ["$lastUsageDate", ""] }, regex: todayPrefix } },
              { $add: [{ $ifNull: ["$dailyUsage", 0] }, 1] },
              1,
            ],
          },
          lastUsageDate: now,
        },
      },
    ],
    { returnDocument: "after" },
  )
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!updated) {
    // 未命中更新：可能是管理员（豁免），也可能是非管理员已达当日上限。
    const adminDoc = await UserModel.findOne({ id, role: { $in: ["admin", "superadmin"] } })
      .select(PUBLIC_USER_SELECT)
      .lean();
    if (adminDoc) {
      return { success: true, user: removeAvatarBase64(adminDoc) as unknown as UserType };
    }
    return { success: false, user: null };
  }

  const user = setCachedUserById(removeAvatarBase64(updated) as unknown as UserType);
  return {
    success: Boolean(updated),
    user,
  };
};

// G2-11: 原子消费 passkey challenge——只有文档里的 pendingChallenge 与预期一致时才清除并返回，
// 否则说明 challenge 已被使用（重放），返回 null。先清后验，杜绝同一断言被并发重放两次。
export const consumePendingChallenge = async (id: string, expectedChallenge: string): Promise<UserType | null> => {
  const doc = await UserModel.findOneAndUpdate(
    { id, pendingChallenge: expectedChallenge },
    { $unset: { pendingChallenge: "", pendingChallengeExpiresAt: "" } },
    { returnDocument: "after" },
  )
    .select(PUBLIC_USER_SELECT)
    .lean();
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

export { UserModel };

// G2-13: 原子消费 TOTP counter——只有传入的 counter 严格大于已记录值时更新成功，
// 否则说明该 counter 已被使用（重放），返回 false。
export const consumeTotpCounter = async (id: string, counter: number): Promise<boolean> => {
  const result = await UserModel.updateOne(
    { id, $or: [{ lastTotpCounter: { $exists: false } }, { lastTotpCounter: { $lt: counter } }] },
    { $set: { lastTotpCounter: counter } },
  );
  return Number(result.modifiedCount || 0) > 0;
};
