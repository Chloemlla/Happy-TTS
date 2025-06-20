import express from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken } from '../middleware/authenticateToken';
import { validateAuthInput } from '../middleware/authValidation';
import rateLimiter from '../middleware/rateLimiter';
import { logUserData } from '../middleware/userDataLogger';
import logger from '../utils/logger';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/config';
import prisma from '../lib/prisma';

const router = express.Router();

// 登录尝试限制
const loginLimiter = rateLimiter({
    windowMs: config.loginRateLimit.windowMs,
    max: config.loginRateLimit.max,
    message: '登录尝试次数过多，请15分钟后再试'
});

// 注册限制
const registerLimiter = rateLimiter({
    windowMs: config.registerRateLimit.windowMs,
    max: config.registerRateLimit.max,
    message: '注册尝试次数过多，请稍后再试'
});

// JWT 签名选项
const jwtSignOptions: SignOptions = {
    expiresIn: '24h'
};

// POST /api/auth/register - 用户注册
router.post('/register', registerLimiter, validateAuthInput, logUserData, AuthController.register);

// POST /api/auth/login - 用户登录
router.post('/login', loginLimiter, validateAuthInput, AuthController.login);

// GET /api/auth/me - 获取用户信息
router.get('/me', authenticateToken, AuthController.getCurrentUser);

export default router; 