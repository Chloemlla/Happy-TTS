import type { Request, Response } from "express";
import { deriveUserOwnerKey } from "../services/librechat/history";
import { asAuthenticatedRequest } from "../types/authRequest";

export interface LibreChatIdentity {
  kind: "user";
  ownerKey: string;
  /** Raw user id used only for one-time Mongo history migration. */
  legacyOwnerId: string;
}

export type LibreChatIdentityResolution =
  | { ok: true; identity: LibreChatIdentity }
  | { ok: false; reason: "account-suspended" | "auth-required" };

function getAuthenticatedUser(req: Request) {
  const authedReq = asAuthenticatedRequest(req);
  return authedReq.auth?.user || authedReq.user;
}

function getAuthenticatedUserId(req: Request): string | undefined {
  const user = getAuthenticatedUser(req);
  const userId = user?.id || String((user as unknown as { _id?: unknown } | undefined)?._id || "");
  return userId.trim() || undefined;
}

/**
 * LibreChat 聊天只归属于登录账号。Router 已通过 authenticateToken 强制登录，
 * 这里仅把已认证用户映射到稳定的 ownerKey；客户端不再能自选身份。
 */
export function resolveLibreChatIdentity(req: Request, _res: Response): LibreChatIdentityResolution {
  const authenticatedUser = getAuthenticatedUser(req);
  if (authenticatedUser?.accountStatus === "suspended") {
    return { ok: false, reason: "account-suspended" };
  }
  const userId = getAuthenticatedUserId(req);
  if (userId) {
    return { ok: true, identity: { kind: "user", ownerKey: deriveUserOwnerKey(userId), legacyOwnerId: userId } };
  }
  return { ok: false, reason: "auth-required" };
}
