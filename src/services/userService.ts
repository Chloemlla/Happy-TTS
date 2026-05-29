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
    role: { type: String, enum: ["user", "admin"], default: "user" },
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

// 工具函数：彻底删除对象中的avatarBase64字段
function removeAvatarBase64(obj: any) {
  if (obj && typeof obj === "object" && "avatarBase64" in obj) {
    delete obj.avatarBase64;
  }
  return obj;
}

export const getAllUsers = async (): Promise<UserType[]> => {
  const docs = await UserModel.find().select(PUBLIC_USER_SELECT).lean();
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
  const doc = await UserModel.findOne({ id })
    .select(PUBLIC_USER_SELECT)
    .lean();

  if (!doc) return null;
  return removeAvatarBase64(doc) as unknown as UserType;
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
  return removeAvatarBase64(doc.toObject()) as unknown as UserType;
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
    if (key === "avatarBase64" && (sanitizedUpdates as any)[key] === undefined) {
      if (!updateOps.$unset) updateOps.$unset = {};
      updateOps.$unset.avatarBase64 = "";
    } else if (key !== "avatarBase64") {
      updateOps.$set[key] = (sanitizedUpdates as any)[key];
    }
  }
  // 如果$set为空对象，删除它
  if (Object.keys(updateOps.$set).length === 0) delete updateOps.$set;
  if (process.env.USER_SERVICE_DEBUG_LOGS === "true") {
    console.log("[updateUser] 更新条件:", { id }, "更新内容:", updateOps);
  }
  const doc = await UserModel.findOneAndUpdate({ id }, updateOps, { returnDocument: "after" }).lean();

  if (process.env.USER_SERVICE_DEBUG_LOGS === "true") {
    console.log("[updateUser] 更新后文档:", removeAvatarBase64(doc));
  }
  return doc ? (removeAvatarBase64(doc) as unknown as UserType) : null;
};

export const deleteUser = async (id: string): Promise<void> => {
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

export const revealUserPassword = async (id: string): Promise<string | null> => {
  const user = await getUserAuthById(id);
  if (!user) {
    return null;
  }
  if (canDecryptPassword(user)) {
    return decryptStoredPassword(user);
  }
  return user.password || null;
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
  return {
    success: Boolean(updated),
    user: updated ? (removeAvatarBase64(updated) as unknown as UserType) : null,
  };
};
