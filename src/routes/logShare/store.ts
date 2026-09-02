import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mongoose } from "../../services/mongoService";
import { isAdminOperationPasswordValid } from "../../utils/adminOperationPassword";
import logger from "../../utils/logger";
import { type User, UserStorage } from "../../utils/userStorage";

const DATA_DIR = path.join(process.cwd(), "data");
export const SHARELOGS_DIR = path.join(DATA_DIR, "sharelogs");
export const logDir = path.join(DATA_DIR, "logs");
export const ARCHIVE_DIR = path.join(DATA_DIR, "archives");
export const TEXT_LOG_EXTENSIONS = new Set([".txt", ".log", ".json", ".md", ".xml", ".csv"]);
const LOGSHARE_ENCRYPTION_VERSION = 2;
const LOGSHARE_KDF_ITERATIONS = 120000;

export interface LogShareEncryptedPayload {
  version: typeof LOGSHARE_ENCRYPTION_VERSION;
  algorithm: "aes-256-gcm";
  kdf: "pbkdf2-sha512";
  iterations: number;
  data: string;
  iv: string;
  salt: string;
  tag: string;
}

const ensureDirectories = async () => {
  for (const dir of [DATA_DIR, SHARELOGS_DIR, logDir, ARCHIVE_DIR]) {
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }
};

ensureDirectories().catch(console.error);

// 模块级单例，避免重复编译 Schema
const LogShareSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, unique: true },
    ext: String,
    content: String,
    fileName: String,
    mimeType: String,
    fileSize: Number,
    note: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "logshare_files" },
);
const LogShareFileModel: mongoose.Model<any> =
  mongoose.models.LogShareFile || mongoose.model("LogShareFile", LogShareSchema);

export function getLogShareModel() {
  return LogShareFileModel;
}

// AES-256-GCM，每份载荷独立 PBKDF2 盐与认证标签
export function encryptData(data: unknown, key: string): LogShareEncryptedPayload {
  const jsonString = JSON.stringify(data);
  const iv = crypto.randomBytes(12);
  const salt = crypto.randomBytes(16);
  const keyHash = crypto.pbkdf2Sync(key, salt, LOGSHARE_KDF_ITERATIONS, 32, "sha512");
  const cipher = crypto.createCipheriv("aes-256-gcm", keyHash, iv);

  let encrypted = cipher.update(jsonString, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    version: LOGSHARE_ENCRYPTION_VERSION,
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2-sha512",
    iterations: LOGSHARE_KDF_ITERATIONS,
    data: encrypted,
    iv: iv.toString("hex"),
    salt: salt.toString("hex"),
    tag: tag.toString("hex"),
  };
}

function hasPasswordMaterial(user: User): boolean {
  return Boolean(
    user?.password ||
      user?.passwordHash ||
      user?.passwordCiphertext ||
      user?.passwordIv ||
      user?.passwordTag ||
      user?.passwordWrappedDek,
  );
}

export async function checkAdminPassword(password: string) {
  if (!password) {
    logger.warn("[LogShare] 管理员密码校验失败", { reason: "missing-password" });
    return false;
  }
  if (isAdminOperationPasswordValid(password)) {
    logger.info("[LogShare] 管理员操作密码校验通过");
    return true;
  }

  const admin = await UserStorage.getPrimaryAdminAuthUser();
  if (!admin || !hasPasswordMaterial(admin)) {
    logger.warn("[LogShare] 管理员密码校验失败", {
      reason: admin ? "admin-password-material-missing" : "admin-user-not-found",
    });
    return false;
  }

  const isValid = await UserStorage.checkPassword(admin, password);
  logger.info("[LogShare] 管理员密码校验完成", { success: isValid });
  return isValid;
}
