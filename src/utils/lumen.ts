import crypto from "node:crypto";

export function nowMillis(): number {
  return Date.now();
}

export function ttlSecondsToMillis(seconds: number): number {
  return seconds * 1000;
}

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function hmacSha256(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

export function generateUuid(): string {
  return crypto.randomUUID();
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}