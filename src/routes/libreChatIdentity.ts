import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { deriveGuestOwnerKey, deriveUserOwnerKey } from "../services/librechat/history";
import { asAuthenticatedRequest } from "../types/authRequest";
import { getAuthCookieOptions, parseCookieHeader } from "../utils/authCookie";

export const LIBRECHAT_GUEST_COOKIE = "lc_guest";
export const LIBRECHAT_GUEST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LEGACY_TOKEN_LENGTH = 4096;
const SERVER_GUEST_TOKEN_PATTERN = /^guest_[a-f0-9]{64}$/;

export interface LibreChatIdentity {
  kind: "user" | "guest";
  ownerKey: string;
  /** Raw legacy lookup value used only for one-time Mongo history migration. */
  legacyOwnerId: string;
}

export type LibreChatIdentityResolution =
  | { ok: true; identity: LibreChatIdentity }
  | { ok: false; reason: "invalid-token" | "auth-required" | "account-suspended" };

export function isLibreChatGuestEnabled(): boolean {
  const envFlag = String(process.env.LIBRECHAT_GUEST_ENABLED || "").toLowerCase();
  if (process.env.NODE_ENV !== "production") return envFlag !== "false";
  return envFlag === "true";
}

function readString(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return undefined;
  const normalized = candidate.trim();
  return normalized || undefined;
}

function getAuthenticatedUser(req: Request) {
  const authedReq = asAuthenticatedRequest(req);
  return authedReq.auth?.user || authedReq.user;
}

function getAuthenticatedUserId(req: Request): string | undefined {
  const user = getAuthenticatedUser(req);
  const userId = user?.id || String((user as unknown as { _id?: unknown })?._id || "");
  return userId.trim() || undefined;
}

function getExplicitGuestCredential(req: Request): string | undefined {
  const bodyToken = readString((req.body as { token?: unknown } | undefined)?.token);
  const headerToken = readString(req.headers["x-chat-token"] || req.headers["x-libretoken"]);
  return headerToken || bodyToken;
}

function getGuestCookie(req: Request): string | undefined {
  const parsedCookies = parseCookieHeader(typeof req.headers.cookie === "string" ? req.headers.cookie : undefined);
  const requestCookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return readString(requestCookies?.[LIBRECHAT_GUEST_COOKIE] || parsedCookies[LIBRECHAT_GUEST_COOKIE]);
}

function setGuestCookie(req: Request, res: Response, token: string): void {
  res.cookie(LIBRECHAT_GUEST_COOKIE, token, {
    ...getAuthCookieOptions(req),
    maxAge: LIBRECHAT_GUEST_MAX_AGE_MS,
  });
}

export function ensureLibreChatGuestCookie(req: Request, res: Response): LibreChatIdentity {
  const existing = getGuestCookie(req);
  const token =
    existing && SERVER_GUEST_TOKEN_PATTERN.test(existing)
      ? existing
      : `guest_${randomBytes(32).toString("hex")}`;
  setGuestCookie(req, res, token);
  return { kind: "guest", ownerKey: deriveGuestOwnerKey(token), legacyOwnerId: token };
}

export function resolveLibreChatIdentity(req: Request, res: Response): LibreChatIdentityResolution {
  const authenticatedUser = getAuthenticatedUser(req);
  if (authenticatedUser?.accountStatus === "suspended") {
    return { ok: false, reason: "account-suspended" };
  }
  const userId = getAuthenticatedUserId(req);
  if (userId) {
    return { ok: true, identity: { kind: "user", ownerKey: deriveUserOwnerKey(userId), legacyOwnerId: userId } };
  }

  const explicitCredential = getExplicitGuestCredential(req);
  if (explicitCredential) {
    if (explicitCredential === "invalid-token" || explicitCredential.length > MAX_LEGACY_TOKEN_LENGTH) {
      return { ok: false, reason: "invalid-token" };
    }
    return {
      ok: true,
      identity: {
        kind: "guest",
        ownerKey: deriveGuestOwnerKey(explicitCredential),
        legacyOwnerId: explicitCredential,
      },
    };
  }

  const cookieCredential = getGuestCookie(req);
  const guestEnabled = isLibreChatGuestEnabled();
  if (guestEnabled && cookieCredential && SERVER_GUEST_TOKEN_PATTERN.test(cookieCredential)) {
    return {
      ok: true,
      identity: {
        kind: "guest",
        ownerKey: deriveGuestOwnerKey(cookieCredential),
        legacyOwnerId: cookieCredential,
      },
    };
  }

  if (!guestEnabled) {
    return { ok: false, reason: "auth-required" };
  }

  return { ok: true, identity: ensureLibreChatGuestCookie(req, res) };
}
