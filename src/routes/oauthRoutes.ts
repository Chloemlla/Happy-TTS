import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OAuthController } from "../controllers/oauthController";
import { adminAuthMiddleware, authMiddleware } from "../middleware/authMiddleware";
import { oauthTokenAuth } from "../middleware/oauthTokenAuth";

const router = Router();
const oauthReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "OAuth 请求过于频繁，请稍后再试" },
});
const oauthTokenEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "OAuth token 请求过于频繁，请稍后再试" },
});
const oauthAuthorizeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "OAuth 授权请求过于频繁，请稍后再试" },
});
const oauthAdminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "OAuth 管理请求过于频繁，请稍后再试" },
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
router.post("/clients", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.createClient);
router.get("/clients/:clientId", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.getClient);
router.put("/clients/:clientId", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.updateClient);
router.post("/clients/:clientId/rotate-secret", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.rotateClientSecret);
router.delete("/clients/:clientId", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.deleteClient);

router.get("/grants", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.listGrants);
router.post("/grants/:grantId/revoke", oauthAdminLimiter, authMiddleware, adminAuthMiddleware, OAuthController.revokeGrant);

export default router;
