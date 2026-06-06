import { Router } from "express";
import { OAuthController } from "../controllers/oauthController";
import { adminAuthMiddleware, authMiddleware } from "../middleware/authMiddleware";
import { oauthTokenAuth } from "../middleware/oauthTokenAuth";

const router = Router();
const requireAdmin = [authMiddleware, adminAuthMiddleware];

/**
 * @openapi
 * /oauth/.well-known/openid-configuration:
 *   get:
 *     summary: OAuth/OIDC 元数据
 *     responses:
 *       200:
 *         description: OAuth provider metadata
 */
router.get("/.well-known/openid-configuration", OAuthController.metadata);
router.get("/metadata", OAuthController.metadata);
router.get("/scopes", OAuthController.scopes);

/**
 * @openapi
 * /oauth/token:
 *   post:
 *     summary: OAuth token endpoint
 *     description: authorization_code / refresh_token 交换。confidential 客户端需 client_secret，public 客户端需 PKCE。
 */
router.post("/token", OAuthController.token);
router.post("/introspect", OAuthController.introspect);
router.post("/revoke", OAuthController.revoke);
router.get("/userinfo", oauthTokenAuth(), OAuthController.userinfo);

router.get("/authorize/preview", ...requireAdmin, OAuthController.authorizePreview);
router.post("/authorize", ...requireAdmin, OAuthController.authorize);

router.get("/clients", ...requireAdmin, OAuthController.listClients);
router.post("/clients", ...requireAdmin, OAuthController.createClient);
router.get("/clients/:clientId", ...requireAdmin, OAuthController.getClient);
router.put("/clients/:clientId", ...requireAdmin, OAuthController.updateClient);
router.post("/clients/:clientId/rotate-secret", ...requireAdmin, OAuthController.rotateClientSecret);
router.delete("/clients/:clientId", ...requireAdmin, OAuthController.deleteClient);

router.get("/grants", ...requireAdmin, OAuthController.listGrants);
router.post("/grants/:grantId/revoke", ...requireAdmin, OAuthController.revokeGrant);

export default router;
