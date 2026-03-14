/**
 * NexAI 鉴权控制器
 * 处理所有 /api/nexai/auth/* 请求
 */
import type { Request, Response } from "express";
import { NexaiAuthService } from "../services/nexaiAuthService";
import logger from "../utils/logger";

/** 安全的用户信息响应（去除敏感字段） */
function sanitizeUser(user: any) {
    const {
        password,
        refreshToken,
        refreshTokenExpiresAt,
        __v,
        _id,
        ...safeUser
    } = user;
    return safeUser;
}

export class NexaiAuthController {
    /**
     * POST /api/nexai/auth/register
     * 邮箱+用户名+密码注册
     */
    static async register(req: Request, res: Response) {
        try {
            const { username, email, password, displayName } = req.body;
            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";

            const result = await NexaiAuthService.register({
                username,
                email,
                password,
                displayName,
                ip,
            });

            res.status(201).json({
                success: true,
                message: "注册成功",
                data: {
                    user: sanitizeUser(result.user),
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            const statusCode = error.statusCode || 500;
            const response: any = {
                success: false,
                error: error.message || "注册失败",
            };
            if (error.validationErrors) {
                response.validationErrors = error.validationErrors;
            }
            res.status(statusCode).json(response);
        }
    }

    /**
     * POST /api/nexai/auth/login
     * 邮箱/用户名 + 密码登录
     */
    static async login(req: Request, res: Response) {
        try {
            const { identifier, username, email, password } = req.body;
            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";

            // 兼容 identifier 或 username/email 字段
            const loginIdentifier = identifier || username || email;

            const result = await NexaiAuthService.login({
                identifier: loginIdentifier,
                password,
                ip,
            });

            res.json({
                success: true,
                message: "登录成功",
                data: {
                    user: sanitizeUser(result.user),
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "登录失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/google
     * Google OAuth 登录/注册
     * Body: { idToken: string }
     */
    static async googleAuth(req: Request, res: Response) {
        try {
            const { idToken } = req.body;
            if (!idToken) {
                return res.status(400).json({
                    success: false,
                    error: "缺少 Google idToken",
                });
            }

            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";
            const result = await NexaiAuthService.googleAuth({ idToken, ip });

            res.json({
                success: true,
                message: result.isNewUser ? "Google 账号注册成功" : "Google 登录成功",
                data: {
                    user: sanitizeUser(result.user),
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    isNewUser: result.isNewUser,
                },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "Google 认证失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/github
     * GitHub OAuth 登录/注册
     * Body: { code: string }
     */
    static async githubAuth(req: Request, res: Response) {
        try {
            const { code } = req.body;
            if (!code) {
                return res.status(400).json({
                    success: false,
                    error: "缺少 GitHub 授权码",
                });
            }

            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";
            const result = await NexaiAuthService.githubAuth({ code, ip });

            res.json({
                success: true,
                message: result.isNewUser ? "GitHub 账号注册成功" : "GitHub 登录成功",
                data: {
                    user: sanitizeUser(result.user),
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    isNewUser: result.isNewUser,
                },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "GitHub 认证失败",
            });
        }
    }

    /**
     * GET /api/nexai/auth/github/callback
     * GitHub OAuth 回调（重定向方式）
     * 用于浏览器端直接重定向的 OAuth 流程
     */
    static async githubCallback(req: Request, res: Response) {
        try {
            const { code } = req.query;
            if (!code || typeof code !== "string") {
                return res.status(400).json({
                    success: false,
                    error: "缺少 GitHub 授权码",
                });
            }

            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";
            const result = await NexaiAuthService.githubAuth({ code, ip });

            // 重定向回前端，携带 token 参数
            const frontendUrl = process.env.NEXAI_FRONTEND_URL || process.env.FRONTEND_URL || "https://tts.951100.xyz";
            const params = new URLSearchParams({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                isNewUser: String(result.isNewUser),
            });
            res.redirect(`${frontendUrl}/nexai/auth/callback?${params.toString()}`);
        } catch (error: any) {
            logger.error("[NexAI] GitHub callback 错误:", error);
            const frontendUrl = process.env.NEXAI_FRONTEND_URL || process.env.FRONTEND_URL || "https://tts.951100.xyz";
            res.redirect(`${frontendUrl}/nexai/auth/callback?error=${encodeURIComponent(error.message)}`);
        }
    }

    /**
     * GET /api/nexai/auth/me
     * 获取当前用户信息
     */
    static async getCurrentUser(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const user = await NexaiAuthService.getUserById(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: "用户不存在" });
            }

            res.json({
                success: true,
                data: { user: sanitizeUser(user) },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message || "获取用户信息失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/refresh
     * 刷新 Access Token
     * Body: { refreshToken: string }
     */
    static async refreshToken(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({
                    success: false,
                    error: "缺少 refreshToken",
                });
            }

            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";
            const result = await NexaiAuthService.refreshAccessToken({
                refreshToken,
                ip,
            });

            res.json({
                success: true,
                message: "Token 刷新成功",
                data: {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "Token 刷新失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/logout
     * 登出
     */
    static async logout(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (userId) {
                await NexaiAuthService.logout(userId);
            }
            res.json({ success: true, message: "已登出" });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message || "登出失败",
            });
        }
    }

    /**
     * PUT /api/nexai/auth/profile
     * 更新个人资料
     */
    static async updateProfile(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const { displayName, username, avatarUrl } = req.body;
            const updatedUser = await NexaiAuthService.updateProfile(userId, {
                displayName,
                username,
                avatarUrl,
            });

            if (!updatedUser) {
                return res.status(404).json({ success: false, error: "用户不存在" });
            }

            res.json({
                success: true,
                message: "个人资料已更新",
                data: { user: sanitizeUser(updatedUser) },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "更新失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/link-google
     * 关联 Google 账号
     * Body: { idToken: string }
     */
    static async linkGoogle(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const { idToken } = req.body;
            if (!idToken) {
                return res.status(400).json({ success: false, error: "缺少 Google idToken" });
            }

            const user = await NexaiAuthService.linkGoogle(userId, idToken);

            res.json({
                success: true,
                message: "Google 账号已关联",
                data: { user: sanitizeUser(user) },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "关联失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/unlink-google
     * 取消关联 Google 账号
     */
    static async unlinkGoogle(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const user = await NexaiAuthService.unlinkGoogle(userId);

            res.json({
                success: true,
                message: "Google 账号已取消关联",
                data: { user: sanitizeUser(user) },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "取消关联失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/link-github
     * 关联 GitHub 账号
     * Body: { code: string }
     */
    static async linkGithub(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const { code } = req.body;
            if (!code) {
                return res.status(400).json({ success: false, error: "缺少 GitHub 授权码" });
            }

            const user = await NexaiAuthService.linkGithub(userId, code);

            res.json({
                success: true,
                message: "GitHub 账号已关联",
                data: { user: sanitizeUser(user) },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "关联失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/unlink-github
     * 取消关联 GitHub 账号
     */
    static async unlinkGithub(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const user = await NexaiAuthService.unlinkGithub(userId);

            res.json({
                success: true,
                message: "GitHub 账号已取消关联",
                data: { user: sanitizeUser(user) },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "取消关联失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/forgot-password
     * 忘记密码
     * Body: { email: string }
     */
    static async forgotPassword(req: Request, res: Response) {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({ success: false, error: "请提供邮箱地址" });
            }

            const result = await NexaiAuthService.forgotPassword(email);

            res.json({
                success: true,
                message: result.message,
                // 开发环境返回 resetToken 便于调试
                ...(process.env.NODE_ENV === "development" && result.resetToken
                    ? { resetToken: result.resetToken }
                    : {}),
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "操作失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/reset-password
     * 重置密码
     * Body: { token: string, newPassword: string }
     */
    static async resetPassword(req: Request, res: Response) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: "缺少重置令牌或新密码",
                });
            }

            await NexaiAuthService.resetPassword({ token, newPassword });

            res.json({
                success: true,
                message: "密码重置成功，请使用新密码登录",
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "密码重置失败",
            });
        }
    }

    /**
     * GET /api/nexai/auth/oauth-config
     * 获取 OAuth 配置信息（公开端点，前端用于初始化 OAuth 流程）
     */
    static async getOAuthConfig(_req: Request, res: Response) {
        res.json({
            success: true,
            data: {
                google: {
                    enabled: !!process.env.NEXAI_GOOGLE_CLIENT_ID,
                    clientId: process.env.NEXAI_GOOGLE_CLIENT_ID || "",
                },
                github: {
                    enabled: !!(process.env.NEXAI_GITHUB_CLIENT_ID && process.env.NEXAI_GITHUB_CLIENT_SECRET),
                    clientId: process.env.NEXAI_GITHUB_CLIENT_ID || "",
                },
            },
        });
    }

    // ========== WebAuthn (Passkeys) ==========

    /**
     * GET /api/nexai/auth/passkey/register/options
     * 获取注册 Passkey 的选项（需先登录）
     */
    static async generatePasskeyRegistrationOptions(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const options = await NexaiAuthService.generatePasskeyRegistrationOptions(userId);

            res.json({
                success: true,
                data: options,
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "获取注册选项失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/passkey/register/verify
     * 验证注册 Passkey（需先登录）
     */
    static async verifyPasskeyRegistration(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: "未授权" });
            }

            const responseInfo = req.body;
            await NexaiAuthService.verifyPasskeyRegistration(userId, responseInfo);

            res.json({
                success: true,
                message: "Passkey 绑定成功",
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "验证失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/passkey/login/options
     * 获取登录 Passkey 的选项
     * Body: { identifier: string }
     */
    static async generatePasskeyAuthenticationOptions(req: Request, res: Response) {
        try {
            const { identifier } = req.body;
            if (!identifier) {
                return res.status(400).json({ success: false, error: "缺少 identifier" });
            }

            const result = await NexaiAuthService.generatePasskeyAuthenticationOptions(identifier);

            res.json({
                success: true,
                data: result.options,
            });
        } catch (error: any) {
            // 为安全起见，用户不存在等也返回相同状态，但此处按需
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "获取登录选项失败",
            });
        }
    }

    /**
     * POST /api/nexai/auth/passkey/login/verify
     * 验证登录 Passkey
     * Body: { identifier: string, response: any }
     */
    static async verifyPasskeyAuthentication(req: Request, res: Response) {
        try {
            const { identifier, response } = req.body;
            if (!identifier || !response) {
                return res.status(400).json({ success: false, error: "参数不完整" });
            }

            const ip = req.ip || req.headers["x-real-ip"] as string || "unknown";

            // 由于 options 阶段我们已把 challenge 保存到特定的用户上，
            // 此时应该使用 identifier 获取 userID（避免安全风险，建议传 userID 此处简化）
            let userId: string;
            // 短路查找
            const safeValue = identifier.replace(/[^a-zA-Z0-9_@.-]/g, "").toLowerCase();
            const { NexaiUserModel } = await import("../models/nexaiUserModel");
            const user = await NexaiUserModel.findOne({
                $or: [{ email: safeValue }, { username: safeValue }]
            }).lean();

            if (!user) throw Object.assign(new Error("用户不存在"), { statusCode: 404 });
            userId = user.id;

            const result = await NexaiAuthService.verifyPasskeyAuthentication(userId, response, ip);

            res.json({
                success: true,
                message: "Passkey 登录成功",
                data: {
                    user: sanitizeUser(result.user),
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message || "登录验证失败",
            });
        }
    }
}
