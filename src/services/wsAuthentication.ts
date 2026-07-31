import type { IncomingMessage } from "node:http";
import { URL } from "node:url";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { AUTH_COOKIE_NAME, parseCookieHeader } from "../utils/authCookie";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";

export interface WebSocketIdentity {
  userId: string | null;
  isAdmin: boolean;
}

interface WebSocketJwtPayload {
  userId?: string;
  id?: string;
  username?: string;
}

/**
 * Resolve the identity before accepting an application WebSocket upgrade.
 * Browser sessions use the HttpOnly Cookie. A query JWT is retained only for
 * legacy non-browser clients and never supplies current authority by itself.
 */
export async function resolveWebSocketIdentity(req: IncomingMessage): Promise<WebSocketIdentity | null> {
  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = (cookies[AUTH_COOKIE_NAME] || "").trim();
  let queryToken = "";

  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    queryToken = (url.searchParams.get("token") || "").trim();
  } catch {
    if (!cookieToken) return { userId: null, isAdmin: false };
  }

  const token = cookieToken || queryToken;
  if (!token) return { userId: null, isAdmin: false };
  const credentialSource = cookieToken ? "cookie" : "legacy_query";

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as WebSocketJwtPayload | string;
    if (!decoded || typeof decoded === "string") return null;

    const claimedId = decoded.userId || decoded.id;
    const user = claimedId
      ? await UserStorage.getUserById(claimedId)
      : decoded.username
        ? await UserStorage.getUserByUsername(decoded.username)
        : null;

    if (!user || (user as typeof user & { disabled?: boolean }).disabled || user.accountStatus === "suspended") {
      logger.warn("[WS] 拒绝无效或已停用的认证主体", { credentialSource });
      return null;
    }

    return {
      userId: user.id,
      isAdmin: user.role === "admin",
    };
  } catch (_error) {
    logger.warn("[WS] 拒绝无效认证凭证", { credentialSource });
    return null;
  }
}
