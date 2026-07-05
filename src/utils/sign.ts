import crypto from "node:crypto";

export function signContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function verifyContent(content: string, signature: string): boolean {
  const expected = signContent(content);
  return expected === signature;
}
