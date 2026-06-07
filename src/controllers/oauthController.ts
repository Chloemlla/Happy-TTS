import type { Request, Response } from "express";
import {
  approveAuthorization,
  canAuthorizeOAuth,
  createOAuthClient,
  deleteOAuthClient,
  denyAuthorization,
  exchangeAuthorizationCode,
  buildOAuthIdentityClaims,
  getOAuthScopeDefinitions,
  getOAuthServerMetadata,
  getOAuthUserInfo,
  getOAuthClient,
  introspectOAuthToken,
  listOAuthClients,
  listOAuthGrants,
  OAuthError,
  refreshAccessToken,
  revokeOAuthGrant,
  revokeOAuthToken,
  rotateOAuthClientSecret,
  updateOAuthClient,
  validateAuthorizeRequest,
} from "../services/oauthService";
import logger from "../utils/logger";
import { stripTrailingSlashes } from "../utils/urlString";

function sendNoStoreHeaders(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
}

function getPublicBaseUrl(req: Request): string {
  const configured = process.env.BASE_URL || process.env.FRONTEND_URL;
  if (configured) return stripTrailingSlashes(configured);
  return stripTrailingSlashes(`${req.protocol}://${req.get("host")}`);
}

function getAdminUser(req: Request): any | null {
  const user = (req as any).user;
  return user?.role === "admin" ? user : null;
}

function getOAuthAuthorizingUser(req: Request): any | null {
  const user = (req as any).user;
  return canAuthorizeOAuth(user) ? user : null;
}

function handleOAuthError(res: Response, error: unknown, logTag: string): Response {
  if (error instanceof OAuthError) {
    if (error.statusCode === 401 && error.errorCode === "invalid_client") {
      res.set("WWW-Authenticate", 'Basic realm="Synapse OAuth"');
    }
    return res.status(error.statusCode).json({
      error: error.errorCode,
      error_description: error.errorDescription,
    });
  }

  logger.error(`[OAuth] ${logTag}`, error);
  return res.status(500).json({ error: "server_error", error_description: "OAuth 服务异常" });
}

function buildAuthorizeInput(source: any) {
  return {
    response_type: String(source?.response_type || ""),
    client_id: String(source?.client_id || ""),
    redirect_uri: String(source?.redirect_uri || ""),
    scope: source?.scope,
    state: typeof source?.state === "string" ? source.state : undefined,
    code_challenge: typeof source?.code_challenge === "string" ? source.code_challenge : undefined,
    code_challenge_method:
      typeof source?.code_challenge_method === "string" ? source.code_challenge_method : undefined,
  };
}

export class OAuthController {
  public static metadata(req: Request, res: Response) {
    sendNoStoreHeaders(res);
    return res.json(getOAuthServerMetadata(getPublicBaseUrl(req)));
  }

  public static scopes(_req: Request, res: Response) {
    return res.json({
      success: true,
      scopes: getOAuthScopeDefinitions(),
    });
  }

  public static async listClients(_req: Request, res: Response) {
    try {
      const clients = await listOAuthClients();
      return res.json({ success: true, clients });
    } catch (error) {
      return handleOAuthError(res, error, "列出客户端失败");
    }
  }

  public static async getClient(req: Request, res: Response) {
    try {
      const clientId = String(req.params.clientId || "");
      const client = await getOAuthClient(clientId);
      if (!client) return res.status(404).json({ error: "OAuth 客户端不存在" });
      return res.json({ success: true, client });
    } catch (error) {
      return handleOAuthError(res, error, "获取客户端失败");
    }
  }

  public static async createClient(req: Request, res: Response) {
    try {
      const admin = getAdminUser(req);
      if (!admin) return res.status(403).json({ error: "需要管理员权限" });

      const result = await createOAuthClient({
        ...req.body,
        ownerUserId: admin.id,
      });

      return res.json({
        success: true,
        client: result.client,
        clientSecret: result.clientSecret,
        message: result.clientSecret ? "请立即保存 clientSecret，它不会再次显示" : "public 客户端已创建",
      });
    } catch (error) {
      return handleOAuthError(res, error, "创建客户端失败");
    }
  }

  public static async updateClient(req: Request, res: Response) {
    try {
      const clientId = String(req.params.clientId || "");
      const client = await updateOAuthClient(clientId, req.body || {});
      if (!client) return res.status(404).json({ error: "OAuth 客户端不存在" });
      return res.json({ success: true, client });
    } catch (error) {
      return handleOAuthError(res, error, "更新客户端失败");
    }
  }

  public static async rotateClientSecret(req: Request, res: Response) {
    try {
      const clientId = String(req.params.clientId || "");
      const result = await rotateOAuthClientSecret(clientId);
      if (!result) return res.status(404).json({ error: "仅 confidential OAuth 客户端可轮换密钥" });
      return res.json({
        success: true,
        client: result.client,
        clientSecret: result.clientSecret,
        message: "请立即保存新的 clientSecret，既有 token 已被吊销",
      });
    } catch (error) {
      return handleOAuthError(res, error, "轮换客户端密钥失败");
    }
  }

  public static async deleteClient(req: Request, res: Response) {
    try {
      const clientId = String(req.params.clientId || "");
      const ok = await deleteOAuthClient(clientId);
      if (!ok) return res.status(404).json({ error: "OAuth 客户端不存在" });
      return res.json({ success: true, message: "OAuth 客户端已停用，相关授权和 token 已吊销" });
    } catch (error) {
      return handleOAuthError(res, error, "停用客户端失败");
    }
  }

  public static async listGrants(_req: Request, res: Response) {
    try {
      const grants = await listOAuthGrants();
      return res.json({ success: true, grants });
    } catch (error) {
      return handleOAuthError(res, error, "列出授权记录失败");
    }
  }

  public static async revokeGrant(req: Request, res: Response) {
    try {
      const grantId = String(req.params.grantId || "");
      const ok = await revokeOAuthGrant(grantId);
      if (!ok) return res.status(404).json({ error: "授权记录不存在" });
      return res.json({ success: true, message: "授权记录和相关 token 已吊销" });
    } catch (error) {
      return handleOAuthError(res, error, "吊销授权失败");
    }
  }

  public static async authorizePreview(req: Request, res: Response) {
    try {
      sendNoStoreHeaders(res);
      const authorizingUser = getOAuthAuthorizingUser(req);
      if (!authorizingUser) {
        return res.status(403).json({
          error: "access_denied",
          error_description: "只有现有 Synapse 管理员或信用者可以授权第三方应用",
        });
      }

      const preview = await validateAuthorizeRequest(buildAuthorizeInput(req.query));
      return res.json({
        success: true,
        ...preview,
        user: {
          id: authorizingUser.id,
          username: authorizingUser.username,
          email: authorizingUser.email,
          ...buildOAuthIdentityClaims(authorizingUser),
          avatarUrl: authorizingUser.avatarUrl || null,
        },
      });
    } catch (error) {
      return handleOAuthError(res, error, "授权预览失败");
    }
  }

  public static async authorize(req: Request, res: Response) {
    try {
      sendNoStoreHeaders(res);
      const authorizingUser = getOAuthAuthorizingUser(req);
      if (!authorizingUser) {
        return res.status(403).json({
          error: "access_denied",
          error_description: "只有现有 Synapse 管理员或信用者可以授权第三方应用",
        });
      }

      const input = buildAuthorizeInput(req.body);
      const approve = req.body?.approve === true || req.body?.approve === "true";
      const result = approve ? await approveAuthorization(input, authorizingUser) : await denyAuthorization(input);
      return res.json({ success: true, redirectUri: result.redirectUri, scopes: "scopes" in result ? result.scopes : [] });
    } catch (error) {
      return handleOAuthError(res, error, "授权处理失败");
    }
  }

  public static async token(req: Request, res: Response) {
    try {
      sendNoStoreHeaders(res);
      const grantType = String(req.body?.grant_type || "");
      if (grantType === "authorization_code") {
        const token = await exchangeAuthorizationCode({
          authHeader: req.headers.authorization,
          clientId: req.body?.client_id,
          clientSecret: req.body?.client_secret,
          code: req.body?.code,
          redirectUri: req.body?.redirect_uri,
          codeVerifier: req.body?.code_verifier,
        });
        return res.json(token);
      }

      if (grantType === "refresh_token") {
        const token = await refreshAccessToken({
          authHeader: req.headers.authorization,
          clientId: req.body?.client_id,
          clientSecret: req.body?.client_secret,
          refreshToken: req.body?.refresh_token,
        });
        return res.json(token);
      }

      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "grant_type 只支持 authorization_code 或 refresh_token",
      });
    } catch (error) {
      return handleOAuthError(res, error, "token 交换失败");
    }
  }

  public static async userinfo(req: Request, res: Response) {
    try {
      sendNoStoreHeaders(res);
      const context = (req as any).oauthContext;
      if (!context) {
        return res.status(401).json({ error: "invalid_token", error_description: "缺少 OAuth access token" });
      }
      return res.json(getOAuthUserInfo(context));
    } catch (error) {
      return handleOAuthError(res, error, "userinfo 获取失败");
    }
  }

  public static async introspect(req: Request, res: Response) {
    try {
      sendNoStoreHeaders(res);
      const result = await introspectOAuthToken({
        authHeader: req.headers.authorization,
        clientId: req.body?.client_id,
        clientSecret: req.body?.client_secret,
        token: req.body?.token,
      });
      return res.json(result);
    } catch (error) {
      return handleOAuthError(res, error, "token introspection 失败");
    }
  }

  public static async revoke(req: Request, res: Response) {
    try {
      sendNoStoreHeaders(res);
      await revokeOAuthToken({
        authHeader: req.headers.authorization,
        clientId: req.body?.client_id,
        clientSecret: req.body?.client_secret,
        token: req.body?.token,
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      return handleOAuthError(res, error, "token revoke 失败");
    }
  }
}
