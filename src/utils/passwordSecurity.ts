import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { config } from "../config/config";
import type { User } from "./userStorageTypes";

const PASSWORD_KEY_VERSION = "v2";
const LEGACY_PASSWORD_KEY_VERSION = "v1";
const PASSWORD_ALGO = "aes-256-gcm";

function getPasswordMasterKey(): Buffer {
  const raw = process.env.PASSWORD_ENCRYPTION_KEY || process.env.AES_KEY || config.jwtSecret;
  return crypto.createHash("sha256").update(raw).digest();
}

function wrapDek(dek: Buffer): string {
  const kek = getPasswordMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(PASSWORD_ALGO, kek, iv);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: PASSWORD_KEY_VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  });
}

function unwrapDek(wrappedDek: string): Buffer | null {
  try {
    const parsed = JSON.parse(wrappedDek);
    const kek = getPasswordMasterKey();
    const decipher = crypto.createDecipheriv(PASSWORD_ALGO, kek, Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}

function deriveLegacyUserKey(userId: string, keyVersion = LEGACY_PASSWORD_KEY_VERSION): Buffer {
  const masterKey = getPasswordMasterKey();
  const info = Buffer.from(`user-password:${userId}:${keyVersion}`, "utf8");
  return Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), info, 32));
}

export interface ProtectedPasswordPayload {
  passwordHash: string;
  passwordCiphertext: string;
  passwordIv: string;
  passwordTag: string;
  passwordKeyVersion: string;
  passwordWrappedDek: string;
  passwordDekId: string;
}

export async function protectPassword(userId: string, password: string): Promise<ProtectedPasswordPayload> {
  const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(PASSWORD_ALGO, dek, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    passwordHash,
    passwordCiphertext: ciphertext.toString("base64"),
    passwordIv: iv.toString("base64"),
    passwordTag: tag.toString("base64"),
    passwordKeyVersion: PASSWORD_KEY_VERSION,
    passwordWrappedDek: wrapDek(dek),
    passwordDekId: `user:${userId}:${Date.now()}`,
  };
}

export async function verifyPasswordHash(passwordHash: string | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}

export function canDecryptPassword(user: Partial<User>): boolean {
  return Boolean(
    user.id &&
      user.passwordCiphertext &&
      user.passwordIv &&
      user.passwordTag &&
      (user.passwordWrappedDek || (user.passwordKeyVersion && user.passwordKeyVersion === LEGACY_PASSWORD_KEY_VERSION)),
  );
}

export function decryptStoredPassword(user: Partial<User>): string | null {
  if (!user.id || !user.passwordCiphertext || !user.passwordIv || !user.passwordTag) {
    return null;
  }

  try {
    const dek =
      typeof user.passwordWrappedDek === "string" && user.passwordWrappedDek
        ? unwrapDek(user.passwordWrappedDek)
        : deriveLegacyUserKey(user.id, user.passwordKeyVersion || LEGACY_PASSWORD_KEY_VERSION);

    if (!dek) {
      return null;
    }

    const decipher = crypto.createDecipheriv(PASSWORD_ALGO, dek, Buffer.from(user.passwordIv, "base64"));
    decipher.setAuthTag(Buffer.from(user.passwordTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(user.passwordCiphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
