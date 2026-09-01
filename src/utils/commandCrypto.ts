/**
 * Shared AEAD helper for Command Manager encrypted responses.
 * version 3: AES-256-GCM, key = HKDF-SHA256(bearer token). Single accepted format.
 */
import * as crypto from "node:crypto";

export const COMMAND_ENCRYPTION_VERSION = 3 as const;
export const COMMAND_ENCRYPTION_ALGORITHM = "aes-256-gcm" as const;

const KEY_SALT = Buffer.from("happy-tts/command-envelope/hkdf-salt", "utf8");
const KEY_INFO = Buffer.from("happy-tts/command-envelope/aes-256-gcm/v3", "utf8");
const ENVELOPE_AAD = Buffer.from(`v${COMMAND_ENCRYPTION_VERSION}:${COMMAND_ENCRYPTION_ALGORITHM}`, "utf8");
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export interface CommandEncryptedPayload {
  version: typeof COMMAND_ENCRYPTION_VERSION;
  algorithm: typeof COMMAND_ENCRYPTION_ALGORITHM;
  data: string;
  iv: string;
  tag: string;
}

function deriveKey(token: string): Buffer {
  if (!token) {
    throw new Error("Command envelope key derivation requires a non-empty token");
  }
  // G8-17: 用 HKDF 而不是裸 sha256(token)。裸哈希没有域分隔，同一 token 在别处
  // 复用会得到同一把密钥；salt/info 把这把密钥钉死在「命令信封 v3」这一个用途上。
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(token, "utf8"), KEY_SALT, KEY_INFO, 32));
}

export function encryptCommandPayload(payload: unknown, token: string): CommandEncryptedPayload {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(COMMAND_ENCRYPTION_ALGORITHM, deriveKey(token), iv);
  cipher.setAAD(ENVELOPE_AAD);
  const data = cipher.update(JSON.stringify(payload), "utf8", "hex") + cipher.final("hex");
  return {
    version: COMMAND_ENCRYPTION_VERSION,
    algorithm: COMMAND_ENCRYPTION_ALGORITHM,
    data,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptCommandPayload(
  envelope: {
    version?: number;
    algorithm?: string;
    data?: string;
    iv?: string;
    tag?: string;
  },
  token: string,
): unknown {
  // G8-17: 版本与算法必须显式匹配。旧实现在字段缺失时回落到无 MAC 的 aes-256-cbc，
  // 攻击者只要省略 version/tag 就能强制降级，那条路径已彻底删除。
  if (envelope.version !== COMMAND_ENCRYPTION_VERSION || envelope.algorithm !== COMMAND_ENCRYPTION_ALGORITHM) {
    throw new Error("Unsupported command envelope version");
  }
  if (!envelope.data || !envelope.iv || !envelope.tag) {
    throw new Error("Malformed command envelope");
  }

  const iv = Buffer.from(envelope.iv, "hex");
  const tag = Buffer.from(envelope.tag, "hex");
  if (iv.length !== GCM_IV_BYTES || tag.length !== GCM_TAG_BYTES) {
    throw new Error("Malformed command envelope");
  }

  const decipher = crypto.createDecipheriv(COMMAND_ENCRYPTION_ALGORITHM, deriveKey(token), iv);
  decipher.setAAD(ENVELOPE_AAD);
  decipher.setAuthTag(tag);
  return JSON.parse(decipher.update(envelope.data, "hex", "utf8") + decipher.final("utf8"));
}
