import crypto from "node:crypto";

export function signContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function verifyContent(content: string, signature: string): boolean {
  const expected = signContent(content);
  if (expected.length !== signature.length) {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return crypto.timingSafeEqual(a, b);
}
