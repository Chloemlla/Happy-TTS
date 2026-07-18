import { Router } from "express";
import { OAuthController } from "../controllers/oauthController";
import { auditLog } from "../middleware/auditLog";
import { adminAuthMiddleware, authMiddleware } from "../middleware/authMiddleware";
import { oauthTokenAuth } from "../middleware/oauthTokenAuth";
import { adminLimiter, createLimiter } from "../middleware/routeLimiters";

const router = Router();
const oauthReadLimiter = createLimiter({
  name: "oauthRead",
  profile: "burst",
  category: "auth",
  max: 120,
  message: "OAuth 请求过于频繁，请稍后再试",
});
const oauthTokenEndpointLimiter = createLimiter({
  name: "oauthTokenEndpoint",
  profile: "auth",
  category: "auth",
  message: "OAuth token 请求过于频繁，请稍后再试",
});
const oauthAuthorizeLimiter = createLimiter({
  name: "oauthAuthorize",
  profile: "auth",
  category: "auth",
  message: "OAuth 授权请求过于频繁，请稍后再试",
});
const oauthAdminLimiter = adminLimiter;

const oauthClientAuditTarget = (req: any) => ({
  targetId: req.params.clientId || req.body?.clientId,
  targetName: req.body?.name,
});

const oauthClientAuditDetail = (req: any) => ({
  requestedFields: Object.keys(req.body || {}).filter((key) => key !== "clientSecret"),
  scopeCount: Array.isArray(req.body?.allowedScopes) ? req.body.allowedScopes.length : undefined,
  redirectUriCount: Array.isArray(req.body?.redirectUris)
    ? req.body.redirectUris.length
    : typeof req.body?.redirectUris === "string"
      ? req.body.redirectUris.split(/\r?\n|,/).filter((item: string) => item.trim()).length
      : undefined,
  enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined,
});

/**
 * @openapi
 * /oauth/.well-known/openid-configuration:
 *   get:
 *     summary: OAuth/OIDC 元数据
 *     responses:
 *       200:
 *         description: OAuth provider metadata
 */
router.get("/.well-known/openid-configuration", oauthReadLimiter, OAuthController.metadata);
router.get("/metadata", oauthReadLimiter, OAuthController.metadata);
router.get("/scopes", oauthReadLimiter, OAuthController.scopes);

/**
 * @openapi
 * /oauth/token:
 *   post:
 *     summary: OAuth token endpoint
 *     description: authorization_code / refresh_token 交换。confidential 客户端需 client_secret，public 客户端需 PKCE。
 */
router.post("/token", oauthTokenEndpointLimiter, OAuthController.token);
router.post("/introspect", oauthTokenEndpointLimiter, OAuthController.introspect);
router.post("/revoke", oauthTokenEndpointLimiter, OAuthController.revoke);
router.get("/userinfo", oauthReadLimiter, oauthTokenAuth(), OAuthController.userinfo);

router.get("/authorize/preview", oauthAuthorizeLimiter, authMiddleware, OAuthController.authorizePreview);
router.post("/authorize", oauthAuthorizeLimiter, authMiddleware, OAuthController.authorize);

router.get("/clients", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.listClients);
router.post(
  "/clients",
  oauthAdminLimiter,
  authMiddleware,
  adminAuthMiddleware,
  auditLog({
    module: "oauth",
    action: "oauth.client.create",
    extractTarget: oauthClientAuditTarget,
    extractDetail: oauthClientAuditDetail,
  }),
  OAuthController.createClient,
);
router.get("/clients/:clientId", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.getClient);
router.put(
  "/clients/:clientId",
  oauthAdminLimiter,
  authMiddleware,
  adminAuthMiddleware,
  auditLog({
    module: "oauth",
    action: "oauth.client.update",
    extractTarget: oauthClientAuditTarget,
    extractDetail: oauthClientAuditDetail,
  }),
  OAuthController.updateClient,
);
router.post(
  "/clients/:clientId/rotate-secret",
  oauthAdminLimiter,
  authMiddleware,
  adminAuthMiddleware,
  auditLog({
    module: "oauth",
    action: "oauth.client.rotate_secret",
    extractTarget: oauthClientAuditTarget,
  }),
  OAuthController.rotateClientSecret,
);
router.delete(
  "/clients/:clientId",
  oauthAdminLimiter,
  authMiddleware,
  adminAuthMiddleware,
  auditLog({
    module: "oauth",
    action: "oauth.client.disable",
    extractTarget: oauthClientAuditTarget,
  }),
  OAuthController.deleteClient,
);

router.get("/grants", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.listGrants);
router.post(
  "/grants/:grantId/revoke",
  oauthAdminLimiter,
  authMiddleware,
  adminAuthMiddleware,
  auditLog({
    module: "oauth",
    action: "oauth.grant.revoke",
    extractTarget: (req) => ({ targetId: req.params.grantId }),
  }),
  OAuthController.revokeGrant,
);

export default router;
