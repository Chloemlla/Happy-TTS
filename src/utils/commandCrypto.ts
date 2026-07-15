/**
 * Shared AEAD helpers for Command Manager encrypted responses.
 * version 1: AES-256-CBC + SHA256(token)  (legacy)
 * version 2: AES-256-GCM + SHA256(token)  (current)
 */
import * as crypto from "node:crypto";

export const COMMAND_ENCRYPTION_VERSION = 2 as const;

export interface CommandEncryptedPayloadV2 {
  version: typeof COMMAND_ENCRYPTION_VERSION;
  algorithm: "aes-256-gcm";
  data: string;
  iv: string;
  tag: string;
}

export interface CommandEncryptedPayloadLegacy {
  success?: boolean;
  data: string;
  iv: string;
}

function deriveKey(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

export function encryptCommandPayload(payload: unknown, token: string): CommandEncryptedPayloadV2 {
  const key = deriveKey(token);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), "utf8", "hex");
  encrypted += cipher.final("hex");
  return {
    version: COMMAND_ENCRYPTION_VERSION,
    algorithm: "aes-256-gcm",
    data: encrypted,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptCommandPayload(envelope: {
  version?: number;
  algorithm?: string;
  data: string;
  iv: string;
  tag?: string;
}, token: string): unknown {
  const key = deriveKey(token);
  if (envelope.version === 2 || envelope.algorithm === "aes-256-gcm") {
    if (!envelope.tag) {
      throw new Error("Missing GCM auth tag");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "hex"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
    let decrypted = decipher.update(envelope.data, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  }

  // Legacy AES-CBC path for dual-read compatibility.
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(envelope.iv, "hex"));
  let decrypted = decipher.update(envelope.data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}
