import type { Router } from "express";
import { authMiddlewareV2 as authMiddleware } from "../../middleware/auth";
import {
  isAccountIdentityProvider,
  listLinkedAccounts,
  unlinkProviderIdentity,
} from "../../services/accountIdentityService";
import { confirmAccountMerge, getMergePreviewByToken } from "../../services/accountMergeService";
import { getGoogleAuthConfigSummary } from "../../services/googleAuthService";
import { createLinuxDoAuthorizationUrl, isLinuxDoAuthEnabled } from "../../services/linuxDoAuthService";
import { consumeProfileVerificationSession } from "../../services/profileUpdateVerificationService";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";

export function registerProfileIdentityRoutes(router: Router): void {
  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.get("/user/profile/linked-accounts", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const dbUser = await UserStorage.getUserById(user.id);
      if (!dbUser) {
        return res.status(404).json({ error: "用户不存在" });
      }

      const accounts = await listLinkedAccounts(dbUser);
      return res.json({ success: true, accounts });
    } catch (error) {
      logger.error("[AdminRoutes] 获取第三方账号绑定状态失败", error);
      return res.status(500).json({ error: "获取第三方账号绑定状态失败" });
    }
  });

  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.post("/user/profile/linked-accounts/:provider/start", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const provider = req.params.provider;
      if (!isAccountIdentityProvider(provider)) {
        return res.status(400).json({ error: "不支持的第三方身份提供商" });
      }

      const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
      if (!verificationToken || !consumeProfileVerificationSession(user.id, verificationToken)) {
        return res.status(401).json({ error: "请先完成身份验证" });
      }

      if (provider === "google") {
        const googleConfig = getGoogleAuthConfigSummary();
        if (!googleConfig.enabled) {
          return res.status(503).json({ error: "Google Auth is not configured" });
        }
        return res.json({
          success: true,
          provider,
          action: "google_id_token",
          clientId: googleConfig.clientId,
        });
      }

      if (!isLinuxDoAuthEnabled()) {
        return res.status(503).json({ error: "Linux.do OAuth is not configured" });
      }

      const authorizationUrl = await createLinuxDoAuthorizationUrl("bind", {
        bindTargetUserId: user.id,
      });

      return res.json({
        success: true,
        provider,
        action: "redirect",
        authorizationUrl,
      });
    } catch (error) {
      logger.error("[AdminRoutes] 启动第三方账号绑定失败", error);
      return res.status(500).json({ error: "启动第三方账号绑定失败" });
    }
  });

  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.post("/user/profile/linked-accounts/:provider/unlink", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const provider = req.params.provider;
      if (!isAccountIdentityProvider(provider)) {
        return res.status(400).json({ error: "不支持的第三方身份提供商" });
      }

      const dbUser = await UserStorage.getUserById(user.id);
      if (!dbUser) {
        return res.status(404).json({ error: "用户不存在" });
      }

      const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
      if (!verificationToken || !consumeProfileVerificationSession(dbUser.id, verificationToken)) {
        return res.status(401).json({ error: "请先完成身份验证" });
      }

      const accounts = await unlinkProviderIdentity({
        user: dbUser,
        provider,
        actor: {
          userId: dbUser.id,
          username: dbUser.username,
          role: dbUser.role,
          ip: getClientIP(req),
          userAgent: String(req.headers["user-agent"] || ""),
          path: req.originalUrl || req.path,
          method: req.method,
          requestId: typeof (req as any).requestId === "string" ? (req as any).requestId : undefined,
        },
      });

      return res.json({ success: true, accounts });
    } catch (error) {
      logger.error("[AdminRoutes] 解绑第三方账号失败", error);
      return res.status(400).json({ error: error instanceof Error ? error.message : "解绑第三方账号失败" });
    }
  });

  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.post("/user/profile/account-merge/preview", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const mergeToken = typeof req.body?.mergeToken === "string" ? req.body.mergeToken : "";
      if (!mergeToken) {
        return res.status(400).json({ error: "缺少合并预览令牌" });
      }

      const preview = await getMergePreviewByToken(mergeToken, user.id);
      return res.json({ success: true, mergeToken, preview });
    } catch (error) {
      logger.error("[AdminRoutes] 获取账号合并预览失败", error);
      return res.status(400).json({ error: error instanceof Error ? error.message : "获取账号合并预览失败" });
    }
  });

  // codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  router.post("/user/profile/account-merge/confirm", authMiddleware, async (req, res) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "未登录" });

      const dbUser = await UserStorage.getUserById(user.id);
      if (!dbUser) {
        return res.status(404).json({ error: "用户不存在" });
      }

      const mergeToken = typeof req.body?.mergeToken === "string" ? req.body.mergeToken : "";
      const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
      if (!mergeToken) {
        return res.status(400).json({ error: "缺少合并令牌" });
      }
      if (!verificationToken || !consumeProfileVerificationSession(dbUser.id, verificationToken)) {
        return res.status(401).json({ error: "确认合并前请先完成身份验证" });
      }

      const result = await confirmAccountMerge({
        token: mergeToken,
        targetUserId: dbUser.id,
        options: {
          includeApiKeys: req.body?.includeApiKeys === true,
          includeOAuthClients: req.body?.includeOAuthClients === true,
          acknowledgeRisks: req.body?.acknowledgeRisks === true,
        },
        actor: {
          userId: dbUser.id,
          username: dbUser.username,
          role: dbUser.role,
          ip: getClientIP(req),
          userAgent: String(req.headers["user-agent"] || ""),
          path: req.originalUrl || req.path,
          method: req.method,
          requestId: typeof (req as any).requestId === "string" ? (req as any).requestId : undefined,
        },
      });

      return res.json(result);
    } catch (error) {
      logger.error("[AdminRoutes] 确认账号合并失败", error);
      return res.status(400).json({ error: error instanceof Error ? error.message : "确认账号合并失败" });
    }
  });
}
