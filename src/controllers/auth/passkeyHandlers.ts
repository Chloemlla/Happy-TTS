import type { Request, Response } from "express";
import { getAuthSessionMetadata, issueTrackedLoginToken } from "../../services/authSessionService";
import { sendEmail } from "../../services/emailSender";
import { generateLoginIpChangedEmailHtml } from "../../templates/emailTemplates";
import { setAuthSessionCookie } from "../../utils/authCookie";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";

/**
 * Passkey 二次校验接口
 * @param req.body { username: string, passkeyCredentialId: any }
 */
export async function passkeyVerify(req: Request, res: Response) {
  try {
    const { username, passkeyCredentialId } = req.body;
    if (!username || !passkeyCredentialId) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

    // 查找用户并验证
    const user = await UserStorage.getUserByUsername(username);
    if (!user) {
      logger.warn("[AuthController] Passkey校验失败：用户不存在", {
        username,
      });
      return res.status(404).json({ error: "用户不存在" });
    }
    if ((user as any).accountStatus === "suspended") {
      return res.status(403).json({ error: "账户已被封停", code: "ACCOUNT_SUSPENDED", supportEmail: "support@chloemlla.com" });
    }

    // 验证用户是否启用了Passkey
    if (!user.passkeyEnabled || !Array.isArray(user.passkeyCredentials) || user.passkeyCredentials.length === 0) {
      logger.warn("[AuthController] Passkey校验失败：用户未启用Passkey", {
        username,
        userId: user.id,
        passkeyEnabled: user.passkeyEnabled,
        credentialsCount: user.passkeyCredentials?.length || 0,
      });
      return res.status(400).json({ error: "用户未启用Passkey" });
    }

    // 验证用户名与用户数据的一致性
    if (user.username !== username) {
      logger.error("[AuthController] Passkey校验失败：用户名与用户数据不匹配", {
        providedUsername: username,
        actualUsername: user.username,
        userId: user.id,
      });
      return res.status(400).json({ error: "用户名验证失败" });
    }

    // Passkey 验证：调用 PasskeyService 进行真实的密码学验证
    try {
      const { PasskeyService } = require("../../services/passkeyService");
      let passkeyResponse = passkeyCredentialId;
      if (typeof passkeyCredentialId === "string") {
        try {
          passkeyResponse = JSON.parse(passkeyCredentialId);
        } catch (_e) {
          // 保持原样，PasskeyService 会处理
        }
      }

      const clientIP = getClientIP(req);
      const verification = await PasskeyService.verifyAuthentication(user, passkeyResponse, clientIP, clientIP);

      if (!verification.verified) {
        return res.status(401).json({ error: "Passkey 校验失败" });
      }

      // 更新用户状态（如添加 passkeyVerified 字段）
      await UserStorage.updateUser(user.id, { passkeyVerified: true });
      logger.info("[AuthController] Passkey 校验通过，已更新用户状态", {
        userId: user.id,
        username,
      });

      // 生成JWT token
      const ip = getClientIP(req);
      const token = await issueTrackedLoginToken(user, getAuthSessionMetadata(req, { ipAddress: ip }));

      logger.info("[AuthController] Passkey验证成功，生成JWT token", {
        userId: user.id,
        username,
        tokenType: "JWT",
      });

      // 异地登录检测（Passkey验证通过后）
      const userAgent = req.headers["user-agent"] || "unknown";
      const lastIp = user.lastLoginIp;
      if (lastIp && lastIp !== "unknown" && ip !== "unknown" && lastIp !== ip && user.email) {
        try {
          const loginTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const emailHtml = generateLoginIpChangedEmailHtml(user.username, ip, lastIp, loginTime, userAgent);
          sendEmail({
            to: user.email,
            subject: "Synapse 异地登录安全提醒",
            html: emailHtml,
            logTag: "异地登录提醒(Passkey)",
            checkQuota: true,
          })
            .then((result) => {
              if (result.success) {
                logger.info(`[异地登录] Passkey路径已发送提醒邮件至 ${user.email}，上次IP=${lastIp}，本次IP=${ip}`);
              } else {
                logger.warn(`[异地登录] Passkey路径提醒邮件发送失败: ${user.email} - ${result.error}`);
              }
            })
            .catch((e) => {
              logger.warn(`[异地登录] Passkey路径提醒邮件发送异常: ${user.email}`, e);
            });
        } catch (notifyErr) {
          logger.warn("[异地登录] Passkey路径发送提醒邮件失败:", notifyErr);
        }
      }

      // 更新上次登录IP和时间
      UserStorage.updateUser(user.id, {
        lastLoginIp: ip,
        lastLoginAt: new Date().toISOString(),
      } as any).catch((e) => {
        logger.warn("[登录] Passkey路径更新lastLoginIp失败:", e);
      });

      const {
        password: _password,
        passwordHash: _passwordHash,
        passwordCiphertext: _passwordCiphertext,
        passwordIv: _passwordIv,
        passwordTag: _passwordTag,
        passwordKeyVersion: _passwordKeyVersion,
        ...userWithoutPassword
      } = user as any;
      setAuthSessionCookie(req, res, token);
      return res.json({
        success: true,
        token,
        authMode: "cookie+bearer",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          isTranslationEnabled: (user as any).isTranslationEnabled,
          translationAccessUntil: (user as any).translationAccessUntil,
          accountStatus: (user as any).accountStatus,
        },
      });
    } catch (passkeyErr) {
      logger.error(`[passkeyVerify] Passkey 验证异常: userId=${user.id}`, passkeyErr);
      return res.status(401).json({ error: "Passkey 校验异常" });
    }
  } catch (error) {
    logger.error("[AuthController] Passkey 校验接口异常", {
      error: error instanceof Error ? error.message : String(error),
      username: req.body?.username,
    });
    return res.status(500).json({ error: "服务器异常" });
  }
}
