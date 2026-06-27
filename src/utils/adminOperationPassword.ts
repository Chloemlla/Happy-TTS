import crypto from "node:crypto";
import { config } from "../config/config";

const MAX_PASSWORD_BYTES = 1024;

function timingSafeStringEqual(candidate: string, expected: string): boolean {
  const candidateLength = Buffer.byteLength(candidate, "utf8");
  const expectedLength = Buffer.byteLength(expected, "utf8");

  if (candidateLength > MAX_PASSWORD_BYTES) {
    return false;
  }

  const compareLength = Math.max(candidateLength, expectedLength);
  const candidateBuffer = Buffer.alloc(compareLength);
  const expectedBuffer = Buffer.alloc(compareLength);

  Buffer.from(candidate, "utf8").copy(candidateBuffer);
  Buffer.from(expected, "utf8").copy(expectedBuffer);

  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer) && candidateLength === expectedLength;
}

export function isAdminOperationPasswordValid(candidate: unknown): boolean {
  if (typeof candidate !== "string" || !candidate) {
    return false;
  }

  if (config.adminOperationPassword && timingSafeStringEqual(candidate, config.adminOperationPassword)) {
    return true;
  }

  if (process.env.NODE_ENV === "test" && timingSafeStringEqual(candidate, process.env.TEST_ADMIN_PASSWORD || "admin")) {
    return true;
  }

  return false;
}
