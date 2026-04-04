import type { Request, Response } from "express";
import {
  completeLinuxDoAuthorization,
  consumeLinuxDoLoginTicket,
  createLinuxDoAuthorizationUrl,
  getLinuxDoConfigSummary,
  getLinuxDoErrorRedirect,
  isLinuxDoAuthEnabled,
  type LinuxDoAuthIntent,
} from "../services/linuxDoAuthService";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";

function parseIntent(value: unknown): LinuxDoAuthIntent {
  return value === "register" ? "register" : "login";
}

export class LinuxDoAuthController {
  public static getConfig(_req: Request, res: Response) {
    res.json(getLinuxDoConfigSummary());
  }

  public static async start(req: Request, res: Response) {
    try {
      if (!isLinuxDoAuthEnabled()) {
        return res.status(503).json({ error: "Linux.do OAuth is not configured" });
      }

      const intent = parseIntent(req.query.intent);
      const authorizationUrl = await createLinuxDoAuthorizationUrl(intent);
      return res.redirect(302, authorizationUrl);
    } catch (error) {
      logger.error("[Linux.do Auth] Failed to start OAuth flow", error);
      return res.status(500).json({ error: "Failed to start Linux.do OAuth flow" });
    }
  }

  public static async callback(req: Request, res: Response) {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const oauthError =
      typeof req.query.error === "string" ? req.query.error : undefined;

    if (oauthError) {
      return res.redirect(302, getLinuxDoErrorRedirect(oauthError));
    }

    if (!code || !state) {
      return res.redirect(
        302,
        getLinuxDoErrorRedirect("Missing Linux.do authorization code or state"),
      );
    }

    try {
      const { redirectUrl } = await completeLinuxDoAuthorization({
        code,
        state,
        clientIp: getClientIP(req),
      });

      return res.redirect(302, redirectUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Linux.do OAuth callback failed";
      logger.error("[Linux.do Auth] OAuth callback failed", {
        message,
        codePresent: Boolean(code),
        statePresent: Boolean(state),
      });
      return res.redirect(302, getLinuxDoErrorRedirect(message));
    }
  }

  public static exchangeTicket(req: Request, res: Response) {
    const { ticket } = req.body ?? {};

    if (!ticket || typeof ticket !== "string") {
      return res.status(400).json({ error: "Missing Linux.do exchange ticket" });
    }

    const payload = consumeLinuxDoLoginTicket(ticket);
    if (!payload) {
      return res
        .status(400)
        .json({ error: "Linux.do exchange ticket is invalid or has expired" });
    }

    return res.json(payload);
  }
}
