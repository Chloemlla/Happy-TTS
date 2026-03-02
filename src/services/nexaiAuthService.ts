/**
 * NexAI 鉴权服务
 * 独立于原系统，提供 JWT、密码哈希、Google/GitHub OAuth 验证
 */
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import validator from "validator";
import axios from "axios";
import { config } from "../config/config";
import { NexaiUserModel, type INexaiUser } from "../models/nexaiUserModel";
import logger from "../utils/logger";

// ========== 配置 ==========

const NEXAI_JWT_SECRET = process.env.NEXAI_JWT_SECRET || config.jwtSecret + "_nexai";
const NEXAI_JWT_EXPIRES = process.env.NEXAI_JWT_EXPIRES || "2h";
const NEXAI_REFRESH_EXPIRES = process.env.NEXAI_REFRESH_EXPIRES || "30d";
const BCRYPT_ROUNDS = 12;

// Google OAuth
const GOOGLE_CLIENT_ID = process.env.NEXAI_GOOGLE_CLIENT_ID || "";

// GitHub OAuth
const GITHUB_CLIENT_ID = process.env.NEXAI_GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.NEXAI_GITHUB_CLIENT_SECRET || "";

// ========== 工具函数 ==========

/** 生成 JWT Access Token */
function generateAccessToken(user: INexaiUser): string {
    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            provider: user.authProvider,
            scope: "nexai",
        },
        NEXAI_JWT_SECRET,
        { expiresIn: NEXAI_JWT_EXPIRES as jwt.SignOptions["expiresIn"] },
    );
}

/** 生成 Refresh Token */
function generateRefreshToken(): string {
    return uuidv4() + "-" + uuidv4();
}

/** 计算 Refresh Token 过期时间 */
function getRefreshTokenExpiry(): number {
    const match = (NEXAI_REFRESH_EXPIRES as string).match(/^(\d+)([dhms])$/);
    if (!match) return Date.now() + 30 * 24 * 60 * 60 * 1000; // 默认30天
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const ms =
        unit === "d"
            ? val * 86400000
            : unit === "h"
                ? val * 3600000
                : unit === "m"
                    ? val * 60000
                    : val * 1000;
    return Date.now() + ms;
}

/** 验证 JWT Token */
function verifyAccessToken(token: string): any {
    return jwt.verify(token, NEXAI_JWT_SECRET);
}

/** 合并 authProvider */
function mergeAuthProvider(existing: string, newProvider: "local" | "google" | "github"): string {
    const providers = new Set(existing.split("+"));
    providers.add(newProvider);
    // 规范化排序
    const sorted = Array.from(providers).sort();
    if (sorted.length === 3) return "all";
    return sorted.join("+");
}

/** 移除 authProvider */
function removeAuthProvider(existing: string, provider: "google" | "github"): string {
    if (existing === "all") {
        const all = ["local", "google", "github"].filter((p) => p !== provider);
        return all.join("+");
    }
    const providers = existing.split("+").filter((p) => p !== provider);
    return providers.length > 0 ? providers.join("+") : "local";
}

// ========== 输入验证 ==========

interface ValidationError {
    field: string;
    message: string;
}

function validateUsername(username: string): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!username || typeof username !== "string") {
        errors.push({ field: "username", message: "用户名不能为空" });
        return errors;
    }
    if (username.length < 3 || username.length > 30) {
        errors.push({ field: "username", message: "用户名长度应为 3-30 个字符" });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        errors.push({ field: "username", message: "用户名只能包含字母、数字、下划线和连字符" });
    }
    return errors;
}

function validateEmail(email: string): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!email || typeof email !== "string") {
        errors.push({ field: "email", message: "邮箱不能为空" });
        return errors;
    }
    if (!validator.isEmail(email)) {
        errors.push({ field: "email", message: "邮箱格式不正确" });
    }
    return errors;
}

function validatePassword(password: string): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!password || typeof password !== "string") {
        errors.push({ field: "password", message: "密码不能为空" });
        return errors;
    }
    if (password.length < 6) {
        errors.push({ field: "password", message: "密码长度不能少于 6 个字符" });
    }
    if (password.length > 128) {
        errors.push({ field: "password", message: "密码长度不能超过 128 个字符" });
    }
    return errors;
}

// ========== 核心服务 ==========

export class NexaiAuthService {
    // ---------- 注册 ----------
    static async register(data: {
        username: string;
        email: string;
        password: string;
        displayName?: string;
        ip?: string;
    }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string }> {
        // 输入验证
        const errors = [
            ...validateUsername(data.username),
            ...validateEmail(data.email),
            ...validatePassword(data.password),
        ];
        if (errors.length > 0) {
            throw Object.assign(new Error("输入验证失败"), { statusCode: 400, validationErrors: errors });
        }

        // 检查用户名和邮箱是否已存在（使用已验证过的安全值）
        const safeUsername = String(data.username).replace(/[^a-zA-Z0-9_-]/g, "");
        const safeEmail = String(data.email).trim().toLowerCase();
        const existingByUsername = await NexaiUserModel.findOne({ username: safeUsername }).lean();
        if (existingByUsername) {
            throw Object.assign(new Error("用户名已被使用"), { statusCode: 409 });
        }

        const existingByEmail = await NexaiUserModel.findOne({ email: safeEmail }).lean();
        if (existingByEmail) {
            throw Object.assign(new Error("邮箱已被注册"), { statusCode: 409 });
        }

        // 创建用户
        const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        const refreshToken = generateRefreshToken();
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        const newUser: any = {
            id: uuidv4(),
            username: data.username,
            email: data.email.trim().toLowerCase(),
            password: hashedPassword,
            displayName: data.displayName || data.username,
            authProvider: "local",
            emailVerified: false,
            role: "user",
            refreshToken: hashedRefreshToken,
            refreshTokenExpiresAt: getRefreshTokenExpiry(),
            lastLoginAt: new Date(),
            lastLoginIp: data.ip || "",
            loginCount: 1,
        };

        const doc = await NexaiUserModel.create(newUser);
        const user = doc.toObject() as INexaiUser;
        const accessToken = generateAccessToken(user);

        logger.info("[NexAI] 用户注册成功", { userId: user.id, username: user.username, provider: "local" });

        return { user, accessToken, refreshToken };
    }

    // ---------- 登录 ----------
    static async login(data: {
        identifier: string; // 用户名或邮箱
        password: string;
        ip?: string;
    }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string }> {
        if (!data.identifier || !data.password) {
            throw Object.assign(new Error("请提供用户名/邮箱和密码"), { statusCode: 400 });
        }

        // 查找用户（支持用户名或邮箱）— 显式清理输入防止 NoSQL 注入
        const identifier = String(data.identifier).trim();
        const isEmail = validator.isEmail(identifier);
        const safeValue = isEmail
            ? identifier.toLowerCase()
            : identifier.replace(/[^a-zA-Z0-9_-]/g, "");
        const query = isEmail ? { email: safeValue } : { username: safeValue };

        const user = await NexaiUserModel.findOne(query).lean() as INexaiUser | null;
        if (!user) {
            throw Object.assign(new Error("用户名或密码错误"), { statusCode: 401 });
        }

        // 检查是否有密码（OAuth 专属用户可能没有密码）
        if (!user.password) {
            throw Object.assign(
                new Error("该账号通过第三方登录创建，请使用 Google 或 GitHub 登录，或先设置密码"),
                { statusCode: 401 },
            );
        }

        // 验证密码
        const isMatch = await bcrypt.compare(data.password, user.password);
        if (!isMatch) {
            throw Object.assign(new Error("用户名或密码错误"), { statusCode: 401 });
        }

        // 生成新 token
        const refreshToken = generateRefreshToken();
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await NexaiUserModel.findOneAndUpdate(
            { id: user.id },
            {
                $set: {
                    refreshToken: hashedRefreshToken,
                    refreshTokenExpiresAt: getRefreshTokenExpiry(),
                    lastLoginAt: new Date(),
                    lastLoginIp: data.ip || "",
                },
                $inc: { loginCount: 1 },
            },
        );

        const accessToken = generateAccessToken(user);

        logger.info("[NexAI] 用户登录成功", { userId: user.id, username: user.username, method: "password" });

        return { user, accessToken, refreshToken };
    }

    // ---------- Google OAuth ----------
    static async googleAuth(data: {
        idToken: string;
        ip?: string;
    }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string; isNewUser: boolean }> {
        if (!GOOGLE_CLIENT_ID) {
            throw Object.assign(new Error("Google OAuth 未配置"), { statusCode: 503 });
        }

        // 验证 Google ID Token
        let googlePayload: any;
        try {
            // 动态导入 google-auth-library（可能未安装时优雅降级）
            const { OAuth2Client } = await import("google-auth-library");
            const client = new OAuth2Client(GOOGLE_CLIENT_ID);
            const ticket = await client.verifyIdToken({
                idToken: data.idToken,
                audience: GOOGLE_CLIENT_ID,
            });
            googlePayload = ticket.getPayload();
        } catch (err: any) {
            logger.error("[NexAI] Google Token 验证失败", { error: err.message });
            throw Object.assign(new Error("Google 身份验证失败"), { statusCode: 401 });
        }

        if (!googlePayload || !googlePayload.sub) {
            throw Object.assign(new Error("无效的 Google Token"), { statusCode: 401 });
        }

        const googleId = googlePayload.sub;
        const googleEmail = googlePayload.email;
        const googleName = googlePayload.name || googlePayload.email?.split("@")[0] || "User";
        const googleAvatar = googlePayload.picture || "";
        const emailVerified = googlePayload.email_verified || false;

        // 查找是否已存在关联的用户
        let user = await NexaiUserModel.findOne({ googleId }).lean() as INexaiUser | null;
        let isNewUser = false;

        if (!user) {
            // 查找是否有相同邮箱的用户（自动关联）
            user = googleEmail
                ? (await NexaiUserModel.findOne({ email: googleEmail.toLowerCase() }).lean() as INexaiUser | null)
                : null;

            if (user) {
                // 自动关联 Google 账号到已有账号
                await NexaiUserModel.findOneAndUpdate(
                    { id: user.id },
                    {
                        $set: {
                            googleId,
                            googleEmail,
                            googleAvatarUrl: googleAvatar,
                            authProvider: mergeAuthProvider(user.authProvider, "google"),
                            emailVerified: emailVerified || user.emailVerified,
                        },
                    },
                );
                user = await NexaiUserModel.findOne({ id: user.id }).lean() as INexaiUser;
                logger.info("[NexAI] Google 账号已关联到现有用户", { userId: user!.id, googleId });
            } else {
                // 创建新用户
                isNewUser = true;
                const username = await generateUniqueUsername(googleName);
                const refreshToken = generateRefreshToken();
                const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

                const newUser: any = {
                    id: uuidv4(),
                    username,
                    email: (googleEmail || `${googleId}@google.nexai`).toLowerCase(),
                    displayName: googleName,
                    avatarUrl: googleAvatar,
                    googleId,
                    googleEmail,
                    googleAvatarUrl: googleAvatar,
                    authProvider: "google",
                    emailVerified,
                    role: "user",
                    refreshToken: hashedRefreshToken,
                    refreshTokenExpiresAt: getRefreshTokenExpiry(),
                    lastLoginAt: new Date(),
                    lastLoginIp: data.ip || "",
                    loginCount: 1,
                };

                const doc = await NexaiUserModel.create(newUser);
                user = doc.toObject() as INexaiUser;

                logger.info("[NexAI] Google OAuth 新用户创建", { userId: user.id, username, googleId });

                return {
                    user,
                    accessToken: generateAccessToken(user),
                    refreshToken,
                    isNewUser,
                };
            }
        }

        // 已有用户，更新登录信息
        const refreshToken = generateRefreshToken();
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await NexaiUserModel.findOneAndUpdate(
            { id: user!.id },
            {
                $set: {
                    refreshToken: hashedRefreshToken,
                    refreshTokenExpiresAt: getRefreshTokenExpiry(),
                    lastLoginAt: new Date(),
                    lastLoginIp: data.ip || "",
                    googleAvatarUrl: googleAvatar,
                },
                $inc: { loginCount: 1 },
            },
        );

        logger.info("[NexAI] Google OAuth 登录成功", { userId: user!.id, googleId });

        return {
            user: user!,
            accessToken: generateAccessToken(user!),
            refreshToken,
            isNewUser,
        };
    }

    // ---------- GitHub OAuth ----------
    static async githubAuth(data: {
        code: string;
        ip?: string;
    }): Promise<{ user: INexaiUser; accessToken: string; refreshToken: string; isNewUser: boolean }> {
        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            throw Object.assign(new Error("GitHub OAuth 未配置"), { statusCode: 503 });
        }

        // 1. 用授权码换取 access_token
        let githubAccessToken: string;
        try {
            const tokenRes = await axios.post(
                "https://github.com/login/oauth/access_token",
                {
                    client_id: GITHUB_CLIENT_ID,
                    client_secret: GITHUB_CLIENT_SECRET,
                    code: data.code,
                },
                {
                    headers: { Accept: "application/json" },
                    timeout: 10000,
                },
            );
            githubAccessToken = tokenRes.data.access_token;
            if (!githubAccessToken) {
                throw new Error(tokenRes.data.error_description || "Failed to get access token");
            }
        } catch (err: any) {
            logger.error("[NexAI] GitHub OAuth 获取 token 失败", { error: err.message });
            throw Object.assign(new Error("GitHub 授权失败"), { statusCode: 401 });
        }

        // 2. 获取 GitHub 用户信息
        let githubUser: any;
        try {
            const userRes = await axios.get("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${githubAccessToken}`,
                    Accept: "application/vnd.github+json",
                },
                timeout: 10000,
            });
            githubUser = userRes.data;
        } catch (err: any) {
            logger.error("[NexAI] GitHub 获取用户信息失败", { error: err.message });
            throw Object.assign(new Error("获取 GitHub 用户信息失败"), { statusCode: 401 });
        }

        // 3. 获取 GitHub 用户邮箱（如果公开邮箱为空）
        let githubEmail = githubUser.email;
        if (!githubEmail) {
            try {
                const emailsRes = await axios.get("https://api.github.com/user/emails", {
                    headers: {
                        Authorization: `Bearer ${githubAccessToken}`,
                        Accept: "application/vnd.github+json",
                    },
                    timeout: 10000,
                });
                const primaryEmail = emailsRes.data.find((e: any) => e.primary && e.verified);
                githubEmail = primaryEmail?.email || emailsRes.data[0]?.email || null;
            } catch (_) {
                // 邮箱获取失败不阻塞流程
            }
        }

        const githubId = String(githubUser.id);
        const githubUsername = githubUser.login;
        const githubAvatar = githubUser.avatar_url || "";
        const githubName = githubUser.name || githubUsername;

        // 查找是否已存在关联的用户
        let user = await NexaiUserModel.findOne({ githubId }).lean() as INexaiUser | null;
        let isNewUser = false;

        if (!user) {
            // 查找是否有相同邮箱的用户（自动关联）
            user = githubEmail
                ? (await NexaiUserModel.findOne({ email: githubEmail.toLowerCase() }).lean() as INexaiUser | null)
                : null;

            if (user) {
                // 自动关联 GitHub 账号到已有账号
                await NexaiUserModel.findOneAndUpdate(
                    { id: user.id },
                    {
                        $set: {
                            githubId,
                            githubUsername,
                            githubEmail,
                            githubAvatarUrl: githubAvatar,
                            authProvider: mergeAuthProvider(user.authProvider, "github"),
                        },
                    },
                );
                user = await NexaiUserModel.findOne({ id: user.id }).lean() as INexaiUser;
                logger.info("[NexAI] GitHub 账号已关联到现有用户", { userId: user!.id, githubId });
            } else {
                // 创建新用户
                isNewUser = true;
                const username = await generateUniqueUsername(githubUsername || githubName);
                const refreshToken = generateRefreshToken();
                const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

                const newUser: any = {
                    id: uuidv4(),
                    username,
                    email: (githubEmail || `${githubId}@github.nexai`).toLowerCase(),
                    displayName: githubName,
                    avatarUrl: githubAvatar,
                    githubId,
                    githubUsername,
                    githubEmail,
                    githubAvatarUrl: githubAvatar,
                    authProvider: "github",
                    emailVerified: !!githubEmail,
                    role: "user",
                    refreshToken: hashedRefreshToken,
                    refreshTokenExpiresAt: getRefreshTokenExpiry(),
                    lastLoginAt: new Date(),
                    lastLoginIp: data.ip || "",
                    loginCount: 1,
                };

                const doc = await NexaiUserModel.create(newUser);
                user = doc.toObject() as INexaiUser;

                logger.info("[NexAI] GitHub OAuth 新用户创建", { userId: user.id, username, githubId });

                return {
                    user,
                    accessToken: generateAccessToken(user),
                    refreshToken,
                    isNewUser,
                };
            }
        }

        // 已有用户，更新登录信息
        const refreshToken = generateRefreshToken();
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

        await NexaiUserModel.findOneAndUpdate(
            { id: user!.id },
            {
                $set: {
                    refreshToken: hashedRefreshToken,
                    refreshTokenExpiresAt: getRefreshTokenExpiry(),
                    lastLoginAt: new Date(),
                    lastLoginIp: data.ip || "",
                    githubAvatarUrl: githubAvatar,
                    githubUsername,
                },
                $inc: { loginCount: 1 },
            },
        );

        logger.info("[NexAI] GitHub OAuth 登录成功", { userId: user!.id, githubId });

        return {
            user: user!,
            accessToken: generateAccessToken(user!),
            refreshToken,
            isNewUser,
        };
    }

    // ---------- Token 刷新 ----------
    static async refreshAccessToken(data: {
        refreshToken: string;
        ip?: string;
    }): Promise<{ accessToken: string; refreshToken: string }> {
        if (!data.refreshToken) {
            throw Object.assign(new Error("缺少 refreshToken"), { statusCode: 400 });
        }

        // 查找所有可能的用户（refreshToken 是哈希存储的，需要逐个比较）
        // 优化：实际生产中应使用 token 前缀索引或 Redis 缓存
        const users = await NexaiUserModel.find({
            refreshToken: { $exists: true, $ne: null },
            refreshTokenExpiresAt: { $gt: Date.now() },
        }).lean() as INexaiUser[];

        let matchedUser: INexaiUser | null = null;
        for (const user of users) {
            if (user.refreshToken && (await bcrypt.compare(data.refreshToken, user.refreshToken))) {
                matchedUser = user;
                break;
            }
        }

        if (!matchedUser) {
            throw Object.assign(new Error("无效或已过期的 refreshToken"), { statusCode: 401 });
        }

        // 生成新的 token 对
        const newRefreshToken = generateRefreshToken();
        const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);

        await NexaiUserModel.findOneAndUpdate(
            { id: matchedUser.id },
            {
                $set: {
                    refreshToken: hashedRefreshToken,
                    refreshTokenExpiresAt: getRefreshTokenExpiry(),
                },
            },
        );

        const accessToken = generateAccessToken(matchedUser);

        logger.info("[NexAI] Token 刷新成功", { userId: matchedUser.id });

        return { accessToken, refreshToken: newRefreshToken };
    }

    // ---------- 获取用户信息 ----------
    static async getUserById(userId: string): Promise<INexaiUser | null> {
        if (!userId || typeof userId !== "string") return null;
        return (await NexaiUserModel.findOne({ id: userId })
            .select("-password -refreshToken -refreshTokenExpiresAt")
            .lean()) as INexaiUser | null;
    }

    static async getUserByIdFull(userId: string): Promise<INexaiUser | null> {
        if (!userId || typeof userId !== "string") return null;
        return (await NexaiUserModel.findOne({ id: userId }).lean()) as INexaiUser | null;
    }

    // ---------- 更新个人资料 ----------
    static async updateProfile(
        userId: string,
        updates: { displayName?: string; username?: string; avatarUrl?: string },
    ): Promise<INexaiUser | null> {
        const setFields: any = {};

        if (updates.displayName !== undefined) {
            if (updates.displayName.length > 50) {
                throw Object.assign(new Error("显示名称不能超过 50 个字符"), { statusCode: 400 });
            }
            setFields.displayName = updates.displayName;
        }

        if (updates.username !== undefined) {
            const errors = validateUsername(updates.username);
            if (errors.length > 0) {
                throw Object.assign(new Error(errors[0].message), { statusCode: 400 });
            }
            // 显式清理：仅允许通过验证的安全字符集
            const sanitizedUsername = String(updates.username).replace(/[^a-zA-Z0-9_-]/g, "");
            const existing = await NexaiUserModel.findOne({
                username: sanitizedUsername,
                id: { $ne: userId },
            }).lean();
            if (existing) {
                throw Object.assign(new Error("用户名已被使用"), { statusCode: 409 });
            }
            setFields.username = sanitizedUsername;
        }

        if (updates.avatarUrl !== undefined) {
            setFields.avatarUrl = updates.avatarUrl;
        }

        if (Object.keys(setFields).length === 0) {
            throw Object.assign(new Error("没有可更新的字段"), { statusCode: 400 });
        }

        const doc = await NexaiUserModel.findOneAndUpdate(
            { id: userId },
            { $set: setFields },
            { new: true },
        )
            .select("-password -refreshToken -refreshTokenExpiresAt")
            .lean();

        return doc as INexaiUser | null;
    }

    // ---------- 关联/取消关联 OAuth ----------
    static async linkGoogle(
        userId: string,
        idToken: string,
    ): Promise<INexaiUser> {
        if (!GOOGLE_CLIENT_ID) {
            throw Object.assign(new Error("Google OAuth 未配置"), { statusCode: 503 });
        }

        let googlePayload: any;
        try {
            const { OAuth2Client } = await import("google-auth-library");
            const client = new OAuth2Client(GOOGLE_CLIENT_ID);
            const ticket = await client.verifyIdToken({
                idToken,
                audience: GOOGLE_CLIENT_ID,
            });
            googlePayload = ticket.getPayload();
        } catch (err: any) {
            throw Object.assign(new Error("Google 身份验证失败"), { statusCode: 401 });
        }

        const googleId = googlePayload.sub;

        // 检查该 Google 账号是否已关联其他用户
        const existingGoogle = await NexaiUserModel.findOne({
            googleId,
            id: { $ne: userId },
        }).lean();
        if (existingGoogle) {
            throw Object.assign(new Error("该 Google 账号已关联到其他用户"), { statusCode: 409 });
        }

        const user = await NexaiUserModel.findOne({ id: userId }).lean() as INexaiUser;
        if (!user) {
            throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
        }

        const doc = await NexaiUserModel.findOneAndUpdate(
            { id: userId },
            {
                $set: {
                    googleId,
                    googleEmail: googlePayload.email,
                    googleAvatarUrl: googlePayload.picture || "",
                    authProvider: mergeAuthProvider(user.authProvider, "google"),
                },
            },
            { new: true },
        )
            .select("-password -refreshToken -refreshTokenExpiresAt")
            .lean();

        logger.info("[NexAI] Google 账号已关联", { userId, googleId });
        return doc as INexaiUser;
    }

    static async unlinkGoogle(userId: string): Promise<INexaiUser> {
        const user = await NexaiUserModel.findOne({ id: userId }).lean() as INexaiUser;
        if (!user) {
            throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
        }

        // 确保至少保留一种登录方式
        const newProvider = removeAuthProvider(user.authProvider, "google");
        if (newProvider === "local" && !user.password) {
            throw Object.assign(
                new Error("取消关联前请先设置密码，以确保至少有一种登录方式"),
                { statusCode: 400 },
            );
        }

        const doc = await NexaiUserModel.findOneAndUpdate(
            { id: userId },
            {
                $set: { authProvider: newProvider },
                $unset: { googleId: "", googleEmail: "", googleAvatarUrl: "" },
            },
            { new: true },
        )
            .select("-password -refreshToken -refreshTokenExpiresAt")
            .lean();

        logger.info("[NexAI] Google 账号已取消关联", { userId });
        return doc as INexaiUser;
    }

    static async linkGithub(
        userId: string,
        code: string,
    ): Promise<INexaiUser> {
        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
            throw Object.assign(new Error("GitHub OAuth 未配置"), { statusCode: 503 });
        }

        // 用 code 换 token
        let githubAccessToken: string;
        try {
            const tokenRes = await axios.post(
                "https://github.com/login/oauth/access_token",
                {
                    client_id: GITHUB_CLIENT_ID,
                    client_secret: GITHUB_CLIENT_SECRET,
                    code,
                },
                { headers: { Accept: "application/json" }, timeout: 10000 },
            );
            githubAccessToken = tokenRes.data.access_token;
            if (!githubAccessToken) throw new Error("No access token");
        } catch (err: any) {
            throw Object.assign(new Error("GitHub 授权失败"), { statusCode: 401 });
        }

        // 获取 GitHub 用户信息
        const userRes = await axios.get("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${githubAccessToken}`,
                Accept: "application/vnd.github+json",
            },
            timeout: 10000,
        });
        const githubId = String(userRes.data.id);
        const githubUsername = userRes.data.login;
        const githubAvatar = userRes.data.avatar_url || "";

        // 获取邮箱
        let githubEmail = userRes.data.email;
        if (!githubEmail) {
            try {
                const emailsRes = await axios.get("https://api.github.com/user/emails", {
                    headers: { Authorization: `Bearer ${githubAccessToken}`, Accept: "application/vnd.github+json" },
                    timeout: 10000,
                });
                const primary = emailsRes.data.find((e: any) => e.primary && e.verified);
                githubEmail = primary?.email || null;
            } catch (_) { }
        }

        // 检查该 GitHub 账号是否已关联其他用户
        const existingGithub = await NexaiUserModel.findOne({
            githubId,
            id: { $ne: userId },
        }).lean();
        if (existingGithub) {
            throw Object.assign(new Error("该 GitHub 账号已关联到其他用户"), { statusCode: 409 });
        }

        const user = await NexaiUserModel.findOne({ id: userId }).lean() as INexaiUser;
        if (!user) {
            throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
        }

        const doc = await NexaiUserModel.findOneAndUpdate(
            { id: userId },
            {
                $set: {
                    githubId,
                    githubUsername,
                    githubEmail,
                    githubAvatarUrl: githubAvatar,
                    authProvider: mergeAuthProvider(user.authProvider, "github"),
                },
            },
            { new: true },
        )
            .select("-password -refreshToken -refreshTokenExpiresAt")
            .lean();

        logger.info("[NexAI] GitHub 账号已关联", { userId, githubId });
        return doc as INexaiUser;
    }

    static async unlinkGithub(userId: string): Promise<INexaiUser> {
        const user = await NexaiUserModel.findOne({ id: userId }).lean() as INexaiUser;
        if (!user) {
            throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
        }

        const newProvider = removeAuthProvider(user.authProvider, "github");
        if (newProvider === "local" && !user.password) {
            throw Object.assign(
                new Error("取消关联前请先设置密码，以确保至少有一种登录方式"),
                { statusCode: 400 },
            );
        }

        const doc = await NexaiUserModel.findOneAndUpdate(
            { id: userId },
            {
                $set: { authProvider: newProvider },
                $unset: { githubId: "", githubUsername: "", githubEmail: "", githubAvatarUrl: "" },
            },
            { new: true },
        )
            .select("-password -refreshToken -refreshTokenExpiresAt")
            .lean();

        logger.info("[NexAI] GitHub 账号已取消关联", { userId });
        return doc as INexaiUser;
    }

    // ---------- 登出 ----------
    static async logout(userId: string): Promise<void> {
        await NexaiUserModel.findOneAndUpdate(
            { id: userId },
            { $unset: { refreshToken: "", refreshTokenExpiresAt: "" } },
        );
        logger.info("[NexAI] 用户登出", { userId });
    }

    // ---------- 忘记密码 ----------
    static async forgotPassword(email: string): Promise<{ message: string; resetToken: string }> {
        const errors = validateEmail(email);
        if (errors.length > 0) {
            throw Object.assign(new Error(errors[0].message), { statusCode: 400 });
        }

        const user = await NexaiUserModel.findOne({ email: email.trim().toLowerCase() }).lean() as INexaiUser | null;
        if (!user) {
            // 不泄露用户是否存在
            return { message: "如果该邮箱已注册，您将收到密码重置指引", resetToken: "" };
        }

        // 生成重置 token（有效期 30 分钟）
        const resetToken = jwt.sign(
            { userId: user.id, purpose: "reset-password", scope: "nexai" },
            NEXAI_JWT_SECRET,
            { expiresIn: "30m" },
        );

        logger.info("[NexAI] 密码重置请求", { userId: user.id, email });

        // TODO: 发送重置邮件（可复用原系统邮件服务）
        return { message: "如果该邮箱已注册，您将收到密码重置指引", resetToken };
    }

    // ---------- 重置密码 ----------
    static async resetPassword(data: {
        token: string;
        newPassword: string;
    }): Promise<void> {
        const errors = validatePassword(data.newPassword);
        if (errors.length > 0) {
            throw Object.assign(new Error(errors[0].message), { statusCode: 400 });
        }

        let decoded: any;
        try {
            decoded = jwt.verify(data.token, NEXAI_JWT_SECRET);
        } catch (_) {
            throw Object.assign(new Error("重置链接已过期或无效"), { statusCode: 400 });
        }

        if (decoded.purpose !== "reset-password" || decoded.scope !== "nexai") {
            throw Object.assign(new Error("无效的重置令牌"), { statusCode: 400 });
        }

        const hashedPassword = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);

        const user = await NexaiUserModel.findOne({ id: decoded.userId }).lean() as INexaiUser | null;
        if (!user) {
            throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
        }

        // 更新密码并确保 authProvider 包含 local
        await NexaiUserModel.findOneAndUpdate(
            { id: decoded.userId },
            {
                $set: {
                    password: hashedPassword,
                    authProvider: mergeAuthProvider(user.authProvider, "local"),
                },
            },
        );

        logger.info("[NexAI] 密码重置成功", { userId: decoded.userId });
    }

    // ---------- 验证 Token（中间件用） ----------
    static verifyToken(token: string): any {
        const decoded = verifyAccessToken(token);
        if (decoded.scope !== "nexai") {
            throw new Error("Token scope 不匹配");
        }
        return decoded;
    }
}

// ========== 辅助函数 ==========

/** 生成唯一用户名（处理冲突） */
async function generateUniqueUsername(baseName: string): Promise<string> {
    // 清理非法字符
    let name = baseName.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
    if (name.length < 3) name = "user_" + name;

    let username = name;
    let attempt = 0;
    while (await NexaiUserModel.findOne({ username }).lean()) {
        attempt++;
        username = `${name}_${crypto.randomBytes(3).toString("hex")}`;
        if (attempt > 10) {
            username = `user_${uuidv4().slice(0, 8)}`;
            break;
        }
    }
    return username;
}
