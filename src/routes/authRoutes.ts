import bcrypt from "bcrypt";
import express from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config/config";
import { AuthController } from "../controllers/authController";
import { authenticateToken } from "../middleware/authenticateToken";
import { validateAuthInput } from "../middleware/authValidation";
import { createLimiter } from "../middleware/rateLimiter";
import { logUserData } from "../middleware/userDataLogger";
import logger from "../utils/logger";

const router = express.Router();

// 登录尝试限制
const loginLimiter = createLimiter({
  windowMs: config.loginRateLimit.windowMs,
  max: config.loginRateLimit.max,
  message: "登录尝试次数过多，请15分钟后再试",
});

// 注册限制
const registerLimiter = createLimiter({
  windowMs: config.registerRateLimit.windowMs,
  max: config.registerRateLimit.max,
  message: "注册尝试次数过多，请稍后再试",
});

// JWT 签名选项
const jwtSignOptions: SignOptions = {
  expiresIn: "24h",
};

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
router.post("/register", registerLimiter, validateAuthInput, logUserData, AuthController.register);

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
router.post("/login", loginLimiter, validateAuthInput, AuthController.login);

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
router.get("/me", authenticateToken, AuthController.getCurrentUser);

// Passkey 二次校验接口
router.post("/passkey-verify", AuthController.passkeyVerify);

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
router.post("/verify-email-link", AuthController.verifyEmailLink);

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
router.post("/verify-email", AuthController.verifyEmail);

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
router.post("/send-verify-email", AuthController.sendVerifyEmail);

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
router.post("/forgot-password", AuthController.forgotPassword);

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
router.post("/reset-password-link", AuthController.resetPasswordLink);

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
router.post("/reset-password", AuthController.resetPassword);

export default router;
