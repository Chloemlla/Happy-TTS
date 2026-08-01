import { randomBytes } from "node:crypto";

export function createUrlSafeRandomId(length: number): string {
  const safeLength = Number.isInteger(length) && length > 0 ? length : 1;
  const byteLength = Math.ceil((safeLength * 3) / 4) + 1;
  return randomBytes(byteLength).toString("base64url").slice(0, safeLength);
}
