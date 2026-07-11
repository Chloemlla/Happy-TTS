import crypto from "node:crypto";

export interface EncryptedLogSharePayload {
  version: number;
  algorithm: "aes-256-gcm";
  kdf: "pbkdf2-sha512";
  iterations: number;
  data: string;
  iv: string;
  salt: string;
  tag: string;
}

export function decryptLogSharePayload(
  payload: EncryptedLogSharePayload,
  password: string,
): Record<string, unknown> {
  const key = crypto.pbkdf2Sync(password, Buffer.from(payload.salt, "hex"), payload.iterations, 32, "sha512");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "hex")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as Record<string, unknown>;
}
