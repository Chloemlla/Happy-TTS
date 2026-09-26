import express, { type Request } from "express";
import { AuthController } from "../controllers/authController";
import { LinuxDoAuthController } from "../controllers/linuxDoAuthController";
import { MobileLoginController } from "../controllers/mobileLoginController";
import { authenticateToken } from "../middleware/authenticateToken";
import { validateAuthInput } from "../middleware/authValidation";
import { createLimiter, loginLimiter, registerLimiter } from "../middleware/routeLimiters";
import { logUserData } from "../middleware/userDataLogger";

const router = express.Router();
const authLoginEndpointLimiter = createLimiter({
  name: "authLoginEndpoint",
  profile: "login",
  category: "login",
  message: "登录请求过于频繁，请稍后再试",
});
const authRegisterEndpointLimiter = createLimiter({
  name: "authRegisterEndpoint",
  profile: "register",
  category: "register",
  message: "注册请求过于频繁，请稍后再试",
});
const authReadLimiter = createLimiter({
  name: "authRead",
  profile: "relaxed",
  category: "auth",
  message: "认证配置请求过于频繁，请稍后再试",
});
const authVerificationLimiter = createLimiter({
  name: "authVerification",
  profile: "verification",
  category: "verification",
  message: "验证请求过于频繁，请稍后再试",
});
const authPasswordResetLimiter = createLimiter({
  name: "authPasswordReset",
  profile: "login",
  category: "auth",
  message: "密码重置请求过于频繁，请稍后再试",
});
const authExternalLoginLimiter = createLimiter({
  name: "authExternalLogin",
  profile: "verification",
  category: "auth",
  message: "第三方登录请求过于频繁，请稍后再试",
});
function hasCallbackProviderError(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0;
}

function hasNonEmptyQueryValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0;
}

export function shouldSkipLinuxDoCallbackRateLimit(req: Request): boolean {
  if (req.method !== "GET") {
    return false;
  }

  // Provider error callbacks and already-completed SPA redirects must not burn
  // the OAuth callback budget while we bounce them to the frontend path.
  if (hasCallbackProviderError(req.query?.error)) {
    return true;
  }

  return (
    hasNonEmptyQueryValue(req.query?.ticket) ||
    hasNonEmptyQueryValue(req.query?.sessionToken) ||
    hasNonEmptyQueryValue(req.query?.mergeToken) ||
    hasNonEmptyQueryValue(req.query?.status)
  );
}

const linuxDoCallbackGetLimiter = createLimiter({
  name: "linuxDoCallbackGet",
  profile: "verification",
  category: "auth",
  message: "第三方登录请求过于频繁，请稍后再试",
  skip: shouldSkipLinuxDoCallbackRateLimit,
});
const authMobileLoginLimiter = createLimiter({
  name: "authMobileLogin",
  profile: "relaxed",
  category: "auth",
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: "扫码登录请求过于频繁，请稍后再试",
});
// 轮换走的是“持有 sml_ 令牌就能推进自己”的路径，所以 IP 维度要另外卡一道；
// 服务端的令牌间隔/每日配额是第二层，两层不互通也不会失效。
const authClientTokenRotateLimiter = createLimiter({
  name: "authClientTokenRotate",
  profile: "verification",
  category: "auth",
  windowMs: 60 * 60 * 1000,
  max: 24,
  message: "令牌轮换请求过于频繁，请稍后再试",
});
// 一次轮换要配一次挑战申请，所以预算比轮换本身宽松一档，别让客户端在第一步就被拦住。
const authIntegrityChallengeLimiter = createLimiter({
  name: "authIntegrityChallenge",
  profile: "verification",
  category: "auth",
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: "设备证明申请过于频繁，请稍后再试",
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: 用户注册
 *     description: 用户注册接口
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 注册成功
 */
router.post("/register", authRegisterEndpointLimiter, registerLimiter, validateAuthInput, logUserData, AuthController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     description: 用户登录接口
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 */
router.post("/login", authLoginEndpointLimiter, loginLimiter, validateAuthInput, AuthController.login);
router.get("/providers/public-config", authReadLimiter, AuthController.getAuthProvidersPublicConfig);
router.get("/google/config", authReadLimiter, AuthController.getGoogleAuthConfig);
router.post("/google", authExternalLoginLimiter, loginLimiter, AuthController.googleAuth);
router.post("/google/bind-session", authExternalLoginLimiter, AuthController.googleBindSession);
router.post("/google/bind", authVerificationLimiter, authenticateToken, AuthController.googleBind);
router.post("/provider-bind/session", authExternalLoginLimiter, AuthController.getProviderBindSession);
router.post("/provider-bind/confirm", authLoginEndpointLimiter, loginLimiter, AuthController.confirmProviderBind);

router.get("/linuxdo/config", authReadLimiter, LinuxDoAuthController.getConfig);
router.get("/linuxdo/start", authExternalLoginLimiter, LinuxDoAuthController.start);
router.get("/linuxdo/callback", linuxDoCallbackGetLimiter, LinuxDoAuthController.callbackGet);
router.post("/linuxdo/callback", authExternalLoginLimiter, LinuxDoAuthController.callback);
router.post("/linuxdo/exchange", authExternalLoginLimiter, LinuxDoAuthController.exchangeTicket);

router.post("/mobile-login/challenge", authMobileLoginLimiter, MobileLoginController.createChallenge);
router.post("/mobile-login/challenge/scan", authMobileLoginLimiter, MobileLoginController.scanChallenge);
router.post("/mobile-login/challenge/confirm", authMobileLoginLimiter, MobileLoginController.confirmChallenge);
router.post("/mobile-login/challenge/poll", authMobileLoginLimiter, MobileLoginController.pollChallenge);
router.post(
  "/mobile-login/client-token/issue",
  authMobileLoginLimiter,
  authenticateToken,
  MobileLoginController.issueClientToken,
);
router.post("/mobile-login/client-token/exchange", authMobileLoginLimiter, MobileLoginController.exchangeClientToken);
/**
 * @openapi
 * /auth/mobile-login/integrity-challenge:
 *   post:
 *     summary: 申请设备证明挑战
 *     description: |
 *       设备证明（P2）的第一步：取一个一次性 nonce，交给客户端向 Google Play Integrity
 *       换取 integrity token，再连同 nonce 一起带回 rotate / issue。
 *       身份可以用 Authorization: Bearer <jwt>（首次签发）或 sml_ 令牌（轮换）表达。
 *       本层未启用时返回 required=false，客户端不需要走这一步。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clientLoginToken:
 *                 type: string
 *               deviceId:
 *                 type: string
 *     responses:
 *       200:
 *         description: required=false 表示服务端未启用设备证明；否则附带 nonce / expiresAt
 *       401:
 *         description: 令牌无效、已过期、已撤销
 *       403:
 *         description: 令牌与 deviceId 不匹配
 */
router.post(
  "/mobile-login/integrity-challenge",
  authMobileLoginLimiter,
  authIntegrityChallengeLimiter,
  MobileLoginController.createIntegrityChallenge,
);
/**
 * @openapi
 * /auth/mobile-login/client-token/rotate:
 *   post:
 *     summary: 轮换客户端登录令牌
 *     description: |
 *       用当前持有的 sml_ 令牌换一张新一代令牌，登录会话不中断。
 *       不要求 JWT；被顶替的旧代超过宽限期再次使用会触发整条血缘吊销。
 *       设备证明（P2）启用时需附带 integrityNonce + integrityToken，未通过只降级不拒绝：
 *       单代有效期缩短、nextRotationAt 提前，响应里以 requiresVerification 标记。
 *       策略正文见 docs/mobile-token-risk-control.md。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clientLoginToken:
 *                 type: string
 *               deviceId:
 *                 type: string
 *               integrityNonce:
 *                 type: string
 *               integrityToken:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum:
 *                   - scheduled
 *                   - manual
 *     responses:
 *       200:
 *         description: 轮换成功，返回新一代令牌与服务端节奏（nextRotationAt / graceMs）
 *       401:
 *         description: 令牌无效、已过期、已撤销，或旧代超宽限期被重复使用（MOBILE_TOKEN_REUSED）
 *       403:
 *         description: 令牌与 deviceId 不匹配
 *       429:
 *         description: 未活满最小轮换间隔或超出每日配额，附 retryAfterSeconds
 */
router.post(
  "/mobile-login/client-token/rotate",
  authMobileLoginLimiter,
  authClientTokenRotateLimiter,
  MobileLoginController.rotateClientToken,
);
router.post(
  "/mobile-login/client-token/revoke",
  authMobileLoginLimiter,
  authenticateToken,
  MobileLoginController.revokeClientToken,
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     description: 获取当前登录用户信息
 *     responses:
 *       200:
 *         description: 用户信息
 */
router.get("/me", authReadLimiter, authenticateToken, AuthController.getCurrentUser);
router.get("/sessions", authReadLimiter, authenticateToken, AuthController.listSessions);
router.post("/sessions/:deviceKey/revoke", authReadLimiter, authenticateToken, AuthController.revokeSessionDevice);
router.post("/session", authReadLimiter, authenticateToken, AuthController.establishSession);

// Passkey 二次校验接口
router.post("/passkey-verify", authVerificationLimiter, AuthController.passkeyVerify);

/**
 * @openapi
 * /auth/verify-email-link:
 *   post:
 *     summary: 验证邮箱链接
 *     description: 通过点击邮件中的验证链接完成注册
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               fingerprint:
 *                 type: string
 *     responses:
 *       200:
 *         description: 验证成功
 */
router.post("/verify-email-link", authVerificationLimiter, AuthController.verifyEmailLink);

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     summary: 验证邮箱（旧版验证码）
 *     description: 验证邮箱接口
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: 验证成功
 */
router.post("/verify-email", authVerificationLimiter, AuthController.verifyEmail);

/**
 * @openapi
 * /auth/send-verify-email:
 *   post:
 *     summary: 发送验证邮箱
 *     description: 发送验证邮箱接口
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: 发送成功
 */
router.post("/send-verify-email", authVerificationLimiter, AuthController.sendVerifyEmail);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: 忘记密码
 *     description: 发送密码重置验证码到邮箱
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: 验证码发送成功
 */
router.post("/forgot-password", authPasswordResetLimiter, AuthController.forgotPassword);

/**
 * @openapi
 * /auth/validate-reset-token:
 *   post:
 *     summary: 预验证重置令牌
 *     description: 验证重置令牌是否有效，检查设备指纹和IP是否与发起请求时一致（不消费令牌）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               fingerprint:
 *                 type: string
 *               clientIP:
 *                 type: string
 *     responses:
 *       200:
 *         description: 令牌有效
 *       400:
 *         description: 令牌无效或设备/网络不匹配
 */
router.post("/validate-reset-token", authPasswordResetLimiter, AuthController.validateResetToken);

/**
 * @openapi
 * /auth/reset-password-link:
 *   post:
 *     summary: 重置密码链接
 *     description: 通过点击邮件中的重置链接完成密码重置
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               fingerprint:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: 密码重置成功
 */
router.post("/reset-password-link", authPasswordResetLimiter, AuthController.resetPasswordLink);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: 重置密码（旧版验证码）
 *     description: 使用验证码重置密码
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: 密码重置成功
 */
router.post("/reset-password", authPasswordResetLimiter, AuthController.resetPassword);

export default router;
