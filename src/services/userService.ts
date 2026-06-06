import validator from "validator";
import type { User as UserType } from "../utils/userStorageTypes";
import { mongoose } from "./mongoService";
import {
  canDecryptPassword,
  decryptStoredPassword,
  protectPassword,
  verifyPasswordHash,
} from "../utils/passwordSecurity";

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
    role: { type: String, enum: ["user", "admin", "trusted"], default: "user" },
    dailyUsage: { type: Number, default: 0 },
    lastUsageDate: { type: String },
    createdAt: { type: String },
    token: String,
    tokenExpiresAt: Number,
    totpSecret: String,
    totpEnabled: Boolean,
    backupCodes: [String],
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
  },
  { collection: "user_datas" },
);

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

const PUBLIC_USER_SELECT =
  "id username email role avatarUrl authProvider linuxdoId linuxdoUsername linuxdoAvatarUrl totpSecret totpEnabled backupCodes passkeyEnabled passkeyCredentials pendingChallenge currentChallenge passkeyVerified requireFingerprint requireFingerprintAt fingerprintRequestDismissedOnce fingerprintRequestDismissedAt fingerprints lastLoginIp lastLoginAt ticketViolationCount ticketBannedUntil isTranslationEnabled translationAccessUntil accountStatus dailyUsage lastUsageDate createdAt token tokenExpiresAt";
const AUTH_USER_SELECT =
  `${PUBLIC_USER_SELECT} password passwordHash passwordCiphertext passwordIv passwordTag passwordKeyVersion passwordWrappedDek passwordDekId`;
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
  totpSecret: 1,
  totpEnabled: 1,
  backupCodes: 1,
  passkeyEnabled: 1,
  passkeyCredentials: 1,
  pendingChallenge: 1,
  currentChallenge: 1,
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
  token: 1,
  tokenExpiresAt: 1,
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
  const doc = await UserModel.findOneAndUpdate({ id }, updateOps, { returnDocument: "after" }).lean();

  if (process.env.USER_SERVICE_DEBUG_LOGS === "true") {
    console.log("[updateUser] 更新后文档:", removeAvatarBase64(doc));
  }
  return doc ? setCachedUserById(removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const deleteUser = async (id: string): Promise<void> => {
  invalidateCachedUserById(id);
  await UserModel.deleteOne({ id });
};

export const getUserAuthById = async (id: string): Promise<UserType | null> => {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("非法的用户ID");
  }
  const doc = await UserModel.findOne({ id }).select(AUTH_USER_SELECT).lean();
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

export const verifyAndMigrateUserPassword = async (
  user: UserType,
  password: string,
): Promise<{ valid: boolean; migrated: boolean; user: UserType | null }> => {
  if (await verifyPasswordHash(user.passwordHash, password)) {
    if (canDecryptPassword(user)) {
      return { valid: true, migrated: false, user };
    }

    const protectedPassword = await protectPassword(user.id, password);
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

export type RevealUserPasswordResult =
  | { status: "ok"; password: string }
  | { status: "not_found" }
  | { status: "not_revealable"; reason: "decrypt_failed" | "empty_password" | "password_hash_only" | "missing_password" };

export const getRevealUserPasswordResult = async (id: string): Promise<RevealUserPasswordResult> => {
  const user = await getUserAuthById(id);
  if (!user) {
    return { status: "not_found" };
  }

  if (canDecryptPassword(user)) {
    const decrypted = decryptStoredPassword(user);
    if (typeof decrypted !== "string") {
      return { status: "not_revealable", reason: "decrypt_failed" };
    }
    if (decrypted.trim().length === 0) {
      return { status: "not_revealable", reason: "empty_password" };
    }
    return { status: "ok", password: decrypted };
  }

  if (typeof user.password === "string" && user.password.trim().length > 0) {
    return { status: "ok", password: user.password };
  }

  return {
    status: "not_revealable",
    reason: user.passwordHash ? "password_hash_only" : "missing_password",
  };
};

export const revealUserPassword = async (id: string): Promise<string | null> => {
  const result = await getRevealUserPasswordResult(id);
  return result.status === "ok" ? result.password : null;
};

export const incrementUserDailyUsageAtomic = async (
  id: string,
  dailyLimit: number,
): Promise<{ success: boolean; user: UserType | null }> => {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  const doc = await UserModel.findOne({ id })
    .select(
      "id username email role password avatarUrl authProvider linuxdoId linuxdoUsername linuxdoAvatarUrl totpSecret totpEnabled backupCodes passkeyEnabled passkeyCredentials pendingChallenge currentChallenge passkeyVerified requireFingerprint requireFingerprintAt fingerprintRequestDismissedOnce fingerprintRequestDismissedAt fingerprints lastLoginIp lastLoginAt ticketViolationCount ticketBannedUntil isTranslationEnabled translationAccessUntil accountStatus dailyUsage lastUsageDate",
    )
    .lean();

  if (!doc) {
    return { success: false, user: null };
  }

  if ((doc as any).role === "admin") {
    return { success: true, user: removeAvatarBase64(doc) as unknown as UserType };
  }

  const lastUsageDate = typeof (doc as any).lastUsageDate === "string" ? String((doc as any).lastUsageDate).split("T")[0] : "";

  const query =
    lastUsageDate === today
      ? { id, dailyUsage: { $lt: dailyLimit }, lastUsageDate: { $regex: `^${today}` } }
      : { id };

  const update =
    lastUsageDate === today
      ? { $inc: { dailyUsage: 1 }, $set: { lastUsageDate: now } }
      : { $set: { dailyUsage: 1, lastUsageDate: now } };

  const updated = await UserModel.findOneAndUpdate(query, update, { returnDocument: "after" }).lean();
  const user = updated ? setCachedUserById(removeAvatarBase64(updated) as unknown as UserType) : null;
  return {
    success: Boolean(updated),
    user,
  };
};
