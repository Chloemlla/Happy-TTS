import type { Request, Response } from "express";
import {
  completeLinuxDoAuthorization,
  consumeLinuxDoLoginTicket,
  createLinuxDoAuthorizationUrl,
  buildLinuxDoFrontendRedirect,
  getLinuxDoConfigSummary,
  getLinuxDoErrorRedirect,
  isLinuxDoAuthEnabled,
  parseLinuxDoAuthClient,
  resolveLinuxDoFrontendCallbackUrl,
  type LinuxDoAuthIntent,
} from "../services/linuxDoAuthService";
import { buildProviderBindPageRedirect } from "../services/providerBindSessionService";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";

function parseIntent(value: unknown): LinuxDoAuthIntent {
  return value === "register" ? "register" : "login";
}

function readCallbackField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
}

export class LinuxDoAuthController {
  private static async handleCallbackPayload(
    req: Request,
    res: Response,
    source: unknown,
    missingPayloadMessage: string,
  ) {
    const payload = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
    const code = readCallbackField(payload.code);
    const state = readCallbackField(payload.state);
    const oauthError = readCallbackField(payload.error) || undefined;
    const ticket = readCallbackField(payload.ticket);
    const intent = readCallbackField(payload.intent) || undefined;
    const bindStatus = readCallbackField(payload.status) || undefined;
    const mergeToken = readCallbackField(payload.mergeToken) || undefined;
    const sessionToken = readCallbackField(payload.sessionToken) || undefined;

    if (oauthError) {
      return res.redirect(302, getLinuxDoErrorRedirect(oauthError));
    }

    // Misconfigured frontendCallbackUrl may point at this backend path with
    // completion params (ticket/status/sessionToken). Bounce once to the SPA.
    if (ticket || bindStatus || sessionToken || mergeToken) {
      if (sessionToken && !ticket && !bindStatus) {
        return res.redirect(
          302,
          buildProviderBindPageRedirect(resolveLinuxDoFrontendCallbackUrl(), sessionToken),
        );
      }
      return res.redirect(
        302,
        buildLinuxDoFrontendRedirect({
          ticket: ticket || undefined,
          intent,
          status: bindStatus,
          mergeToken: mergeToken || undefined,
        }),
      );
    }

    if (!code || !state) {
      return res.redirect(302, getLinuxDoErrorRedirect(missingPayloadMessage));
    }

    try {
      const { redirectUrl } = await completeLinuxDoAuthorization({
        code,
        state,
        clientIp: getClientIP(req),
      });

      return res.redirect(302, redirectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Linux.do 登录回调失败";
      logger.error("[Linux.do Auth] OAuth callback failed", {
        message,
        codePresent: Boolean(code),
        statePresent: Boolean(state),
      });
      return res.redirect(302, getLinuxDoErrorRedirect(message));
    }
  }

  public static getConfig(_req: Request, res: Response) {
    res.json(getLinuxDoConfigSummary());
  }

  public static async start(req: Request, res: Response) {
    try {
      if (!isLinuxDoAuthEnabled()) {
        return res.status(503).json({ error: "Linux.do 登录未配置" });
      }

      const intent = parseIntent(req.query.intent);
      const client = parseLinuxDoAuthClient(req.query.client);
      const authorizationUrl = await createLinuxDoAuthorizationUrl(intent, { client });
      return res.redirect(302, authorizationUrl);
    } catch (error) {
      logger.error("[Linux.do Auth] Failed to start OAuth flow", error);
      return res.status(500).json({ error: "无法启动 Linux.do 登录流程" });
    }
  }

  public static async callback(req: Request, res: Response) {
    return LinuxDoAuthController.handleCallbackPayload(
      req,
      res,
      req.body,
      "缺少 Linux.do 授权码或登录状态",
    );
  }

  public static async callbackGet(req: Request, res: Response) {
    return LinuxDoAuthController.handleCallbackPayload(
      req,
      res,
      req.query,
      "缺少 Linux.do 授权码或登录状态",
    );
  }

  public static exchangeTicket(req: Request, res: Response) {
    const { ticket } = req.body ?? {};

    if (!ticket || typeof ticket !== "string") {
      return res.status(400).json({ error: "缺少 Linux.do 登录交换票据" });
    }

    const payload = consumeLinuxDoLoginTicket(ticket);
    if (!payload) {
      return res.status(400).json({ error: "Linux.do 登录交换票据无效或已过期" });
    }

    return res.json(payload);
  }
}
