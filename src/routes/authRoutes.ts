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
