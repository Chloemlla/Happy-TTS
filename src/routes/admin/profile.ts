import express from "express";
import validator from "validator";
import { authMiddlewareV2 as authMiddleware, isAdminRole } from "../../middleware/auth";
import { sendEmail } from "../../services/emailSender";
import {
  clearEmailChangeChallenge,
  clearProfileVerificationSessions,
  consumeProfileVerificationSession,
  createEmailChangeChallenge,
  createProfileVerificationSession,
  validateEmailChangeChallenge,
} from "../../services/profileUpdateVerificationService";
import {
  generateEmailChangeNewNoticeHtml,
  generateEmailChangeOldNoticeHtml,
  generateVerificationCodeEmailHtml,
} from "../../templates/emailTemplates";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";
import {
  AuthSessionError,
  listAuthDevices,
  revokeAllAuthSessions,
  revokeAuthDevice,
} from "../../services/authSessionService";
import { getTokenFromRequest } from "../../utils/authCookie";
import crypto from "node:crypto";
import { getUserAuthById } from "../../services/userService";
import { TOTPService } from "../../services/totpService";
import { PasskeyService } from "../../services/passkeyService";
import { registerProfileAvatarRoutes } from "./profile.avatar";
import { registerProfileFingerprintRoutes } from "./profile.fingerprint";
import { registerProfileIdentityRoutes } from "./profile.identity";

const router = express.Router();

function normalizeEmail(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

async function findUserByNormalizedEmail(email: string) {
  const exactMatch = await UserStorage.getUserByEmail(email);
  if (exactMatch) {
    return exactMatch;
  }

  const users = await UserStorage.getAllUsers();
  return users.find((item) => normalizeEmail(item.email) === email) || null;
}

// 管理员权限验证API
router.post("/verify-access", async (req, res) => {
  try {
    console.log("🔐 [AdminAccess] 开始验证管理员访问权限...");
    console.log("   用户ID:", req.user?.id);
    console.log("   用户名:", req.user?.username);
    console.log("   用户角色:", req.user?.role);
    console.log("   请求IP:", req.ip);

    // 检查用户是否存在
    if (!req.user) {
      console.log("❌ [AdminAccess] 权限验证失败：用户不存在");
      return res.status(401).json({
        success: false,
        message: "用户不存在",
      });
    }

    // 检查用户角色
    if (!isAdminRole(req.user.role)) {
      console.log("❌ [AdminAccess] 权限验证失败：非管理员用户", {
        userId: req.user.id,
        role: req.user.role,
      });
      return res.status(403).json({
        success: false,
        message: "权限不足，仅限管理员访问",
      });
    }

    // 验证请求体中的用户信息
    const { userId, username, role } = req.body;
    if (userId !== req.user.id || username !== req.user.username || role !== req.user.role) {
      console.log("❌ [AdminAccess] 权限验证失败：用户信息不匹配", {
        requestBody: { userId, username, role },
        tokenUser: { id: req.user.id, username: req.user.username, role: req.user.role },
      });
      return res.status(403).json({
        success: false,
        message: "用户信息不匹配",
      });
    }

    console.log("✅ [AdminAccess] 管理员权限验证通过");

    res.json({
      success: true,
      message: "权限验证通过",
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("❌ [AdminAccess] 权限验证过程中发生错误:", error);
    res.status(500).json({
      success: false,
      message: "权限验证失败",
    });
  }
});

// 用户信息获取接口（需登录）
router.get("/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });
    const { id, username, role } = user;
    let email;
    let avatarUrl;
    let avatarHash;
    const dbUser = await UserStorage.getUserById(id);
    if (dbUser) {
      email = dbUser.email;
      if (dbUser.avatarUrl && typeof dbUser.avatarUrl === "string" && dbUser.avatarUrl.length > 0) {
        // 将 ipfs.crossbell.io 替换为 ipfs.chloemlla.com
        avatarUrl = dbUser.avatarUrl.replace("ipfs.crossbell.io", "ipfs.chloemlla.com");
        // 尝试从URL中提取hash（如文件名带hash），否则可用md5等生成
        const match = avatarUrl.match(/([a-fA-F0-9]{8,})\.(jpg|jpeg|png|webp|gif)$/);
        if (match) {
          avatarHash = match[1];
        } else {
          // 若URL不带hash，可用URL整体md5
          avatarHash = crypto.createHash("md5").update(avatarUrl).digest("hex");
        }
      }
    }
    const resp = {
      id,
      username,
      email,
      role,
      createdAt: dbUser?.createdAt,
      authProvider: dbUser?.authProvider || "local",
      linuxdoUsername: dbUser?.linuxdoUsername,
      lastLoginAt: dbUser?.lastLoginAt,
      lastLoginIp: dbUser?.lastLoginIp,
      isTranslationEnabled: Boolean(dbUser?.isTranslationEnabled),
      translationAccessUntil: dbUser?.translationAccessUntil,
      accountStatus: dbUser?.accountStatus || "active",
    };
    if (avatarUrl) {
      (resp as any).avatarUrl = avatarUrl;
      (resp as any).avatarHash = avatarHash;
    }
    res.json(resp);
  } catch (_e) {
    res.status(500).json({ error: "获取用户信息失败" });
  }
});

router.get("/user/profile/devices", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const token = getTokenFromRequest(req);
    if (!user || !token) return res.status(401).json({ error: "未登录" });

    const devices = await listAuthDevices(user.id, token);
    return res.json({ success: true, devices });
  } catch (error) {
    logger.error("[AdminRoutes] 获取资料页设备会话失败", error);
    return res.status(500).json({ error: "获取设备会话失败" });
  }
});

router.post("/user/profile/devices/:deviceKey/revoke", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const token = getTokenFromRequest(req);
    const deviceKey = typeof req.params.deviceKey === "string" ? req.params.deviceKey : "";
    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
    if (!user || !token) return res.status(401).json({ error: "未登录" });
    if (!/^[a-f0-9]{40}$/.test(deviceKey)) return res.status(400).json({ error: "设备标识无效" });
    if (!verificationToken || !consumeProfileVerificationSession(user.id, verificationToken)) {
      return res.status(401).json({ error: "请先完成身份验证", code: "PROFILE_VERIFICATION_REQUIRED" });
    }

    const result = await revokeAuthDevice(user.id, deviceKey, token);
    return res.json({ success: true, revokedCount: result.revoked, ...result });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      const status = error.code === "CURRENT_SESSION_PROTECTED" ? 409 : error.code === "SESSION_NOT_FOUND" ? 404 : 401;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    logger.error("[AdminRoutes] 撤销资料页设备会话失败", error);
    return res.status(500).json({ error: "撤销设备会话失败" });
  }
});

// 用户信息更新接口（需登录）
router.post("/user/profile/verify", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const dbUser = await getUserAuthById(user.id);
    if (!dbUser) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const method = typeof req.body?.method === "string" ? req.body.method : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const verificationCode = typeof req.body?.verificationCode === "string" ? req.body.verificationCode.trim() : "";

    if (!method || !["password", "totp", "passkey"].includes(method)) {
      return res.status(400).json({ error: "无效的验证方式" });
    }

    if (method === "password") {
      if (!password || !(await UserStorage.checkPassword(dbUser, password))) {
        return res.status(401).json({ error: "当前密码错误" });
      }
    }

    if (method === "totp") {
      if (!dbUser.totpEnabled || !dbUser.totpSecret) {
        return res.status(400).json({ error: "当前账户未启用 TOTP" });
      }

      if (!/^\d{6}$/.test(verificationCode)) {
        return res.status(400).json({ error: "请输入 6 位 TOTP 验证码" });
      }

      // G2-13: 带 counter 重放防护（原子消费）
      const totpCheck = TOTPService.verifyTokenWithCounter(verificationCode, dbUser.totpSecret);
      let isValid = totpCheck.valid;
      if (isValid && totpCheck.counter !== null) {
        isValid = await UserStorage.consumeTotpCounter(dbUser.id, totpCheck.counter);
      }

      if (!isValid) {
        return res.status(401).json({ error: "TOTP 验证失败" });
      }
    }

    if (method === "passkey") {
      if (
        !dbUser.passkeyEnabled ||
        !Array.isArray(dbUser.passkeyCredentials) ||
        dbUser.passkeyCredentials.length === 0
      ) {
        return res.status(400).json({ error: "当前账户未启用 Passkey" });
      }

      if (!req.body?.passkeyResponse || typeof req.body.passkeyResponse !== "object") {
        return res.status(400).json({ error: "缺少 Passkey 验证数据" });
      }

      const clientOrigin = typeof req.body?.clientOrigin === "string" ? req.body.clientOrigin : undefined;
      const requestOrigin =
        clientOrigin ||
        (typeof req.headers.origin === "string" ? req.headers.origin : undefined) ||
        (typeof req.headers.referer === "string" ? req.headers.referer : undefined) ||
        "https://tts.chloemlla.com";

      const verification = await PasskeyService.verifyAuthentication(
        dbUser,
        req.body.passkeyResponse,
        clientOrigin,
        requestOrigin,
      );

      if (!verification?.verified) {
        return res.status(401).json({ error: "Passkey 验证失败" });
      }
    }

    const session = createProfileVerificationSession(dbUser.id, method as "password" | "totp" | "passkey");

    return res.json({
      success: true,
      verificationToken: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("[AdminRoutes] 用户资料验证失败:", error);
    return res.status(500).json({ error: "身份验证失败" });
  }
});

registerProfileIdentityRoutes(router);

router.post("/user/profile/email/send-code", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const dbUser = await getUserAuthById(user.id);
    if (!dbUser) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
    const newEmail = normalizeEmail(req.body?.newEmail);

    if (!verificationToken) {
      return res.status(401).json({ error: "请先完成身份验证" });
    }

    if (!consumeProfileVerificationSession(dbUser.id, verificationToken)) {
      return res.status(401).json({ error: "身份验证已过期，请重新验证" });
    }

    if (!newEmail || !validator.isEmail(newEmail)) {
      return res.status(400).json({ error: "请输入有效的新邮箱地址" });
    }

    if (normalizeEmail(dbUser.email) === newEmail) {
      return res.status(400).json({ error: "新邮箱不能与当前邮箱相同" });
    }

    const matchedUser = await findUserByNormalizedEmail(newEmail);
    if (matchedUser && matchedUser.id !== dbUser.id) {
      return res.status(400).json({ error: "该邮箱已被其他账户使用" });
    }

    const challenge = createEmailChangeChallenge(dbUser.id, newEmail);
    if (!challenge.success || !challenge.code) {
      return res.status(429).json({ error: challenge.error || "验证码发送过于频繁，请稍后再试" });
    }

    const emailHtml = generateVerificationCodeEmailHtml(dbUser.username, challenge.code);
    const result = await sendEmail({
      to: newEmail,
      subject: "Synapse 邮箱变更验证码",
      html: emailHtml,
      logTag: "邮箱变更验证码",
    });

    if (!result.success) {
      clearEmailChangeChallenge(dbUser.id);
      return res.status(500).json({ error: result.error || "验证码发送失败，请稍后重试" });
    }

    return res.json({
      success: true,
      message: "验证码已发送到新邮箱",
    });
  } catch (error) {
    console.error("[AdminRoutes] 发送邮箱变更验证码失败:", error);
    return res.status(500).json({ error: "验证码发送失败，请稍后重试" });
  }
});

router.post("/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });
    const rawEmail = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const avatarUrl = typeof req.body?.avatarUrl === "string" ? req.body.avatarUrl : "";
    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
    const emailVerificationCode =
      typeof req.body?.emailVerificationCode === "string" ? req.body.emailVerificationCode.trim() : "";

    const dbUser = await UserStorage.getUserById(user.id);
    if (!dbUser) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const normalizedCurrentEmail = normalizeEmail(dbUser.email);
    const emailChanged = Boolean(rawEmail) && rawEmail !== normalizedCurrentEmail;
    const wantsPasswordChange = Boolean(newPassword);
    const wantsAvatarUpdate = Boolean(avatarUrl);

    if (!emailChanged && !wantsPasswordChange && !wantsAvatarUpdate) {
      return res.status(400).json({ error: "没有可更新的内容" });
    }

    let verifiedBySession = false;
    if (verificationToken) {
      verifiedBySession = Boolean(consumeProfileVerificationSession(dbUser.id, verificationToken));

      if (!verifiedBySession) {
        return res.status(401).json({ error: "身份验证已过期，请重新验证" });
      }
    }

    if (emailChanged) {
      if (!validator.isEmail(rawEmail)) {
        return res.status(400).json({ error: "请输入有效的新邮箱地址" });
      }

      if (!verifiedBySession) {
        return res.status(401).json({ error: "修改邮箱前请先完成身份验证" });
      }

      if (!emailVerificationCode) {
        return res.status(400).json({ error: "请输入新邮箱验证码" });
      }

      const matchedUser = await findUserByNormalizedEmail(rawEmail);
      if (matchedUser && matchedUser.id !== dbUser.id) {
        return res.status(400).json({ error: "该邮箱已被其他账户使用" });
      }

      const challengeResult = validateEmailChangeChallenge(dbUser.id, rawEmail, emailVerificationCode);
      if (!challengeResult.success) {
        return res.status(challengeResult.status).json({ error: challengeResult.error || "邮箱验证码校验失败" });
      }
    }

    if (wantsPasswordChange) {
      if (await UserStorage.checkPassword(dbUser, newPassword)) {
        return res.status(400).json({ error: "新密码不能与当前密码相同" });
      }

      if (verifiedBySession) {
        const passwordErrors = UserStorage.validateUserInput(dbUser.username, newPassword, dbUser.email, true);
        if (passwordErrors.length > 0) {
          return res.status(400).json({ error: passwordErrors[0].message });
        }
      } else {
        if (!password || !(await UserStorage.checkPassword(dbUser, password))) {
          return res.status(401).json({ error: "当前密码错误" });
        }

        const passwordErrors = UserStorage.validateUserInput(dbUser.username, newPassword, dbUser.email, true);
        if (passwordErrors.length > 0) {
          return res.status(400).json({ error: passwordErrors[0].message });
        }
      }
    }

    const updateData: any = {};
    if (emailChanged) updateData.email = rawEmail;
    if (avatarUrl && typeof avatarUrl === "string") {
      updateData.avatarUrl = avatarUrl;
    }
    if (wantsPasswordChange) updateData.password = newPassword;
    await UserStorage.updateUser(user.id, updateData);
    // G2-02: 用户自助改密成功后撤销全部会话，旧 JWT 立即失效。
    if (wantsPasswordChange) {
      await revokeAllAuthSessions(user.id);
    }
    const updated = await UserStorage.getUserById(user.id);
    if (!updated) {
      return res.status(500).json({ error: "更新后无法获取用户信息" });
    }

    if (emailChanged) {
      clearEmailChangeChallenge(dbUser.id);
    }
    if (verifiedBySession) {
      clearProfileVerificationSessions(dbUser.id);
    }

    if (emailChanged) {
      const changeTime = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
      });
      const clientIP = getClientIP(req);
      const deviceName = String(req.headers["user-agent"] || "unknown");

      if (dbUser.email) {
        const oldEmailHtml = generateEmailChangeOldNoticeHtml(
          dbUser.username,
          rawEmail,
          changeTime,
          clientIP,
          deviceName,
        );
        sendEmail({
          to: dbUser.email,
          subject: "Synapse 账户邮箱已更改",
          html: oldEmailHtml,
          logTag: "用户自助修改邮箱-旧邮箱通知",
          checkQuota: true,
        })
          .then((result) => {
            if (result.success) {
              logger.info(`[用户自助修改邮箱-旧邮箱通知] 成功发送到 ${dbUser.email}`);
            } else {
              logger.warn(`[用户自助修改邮箱-旧邮箱通知] 发送失败: ${dbUser.email} - ${result.error}`);
            }
          })
          .catch((e) => {
            logger.warn(`[用户自助修改邮箱-旧邮箱通知] 发送异常: ${dbUser.email}`, e);
          });
      }

      const newEmailHtml = generateEmailChangeNewNoticeHtml(
        dbUser.username,
        dbUser.email,
        changeTime,
        clientIP,
        deviceName,
      );
      sendEmail({
        to: rawEmail,
        subject: "Synapse 新邮箱绑定成功",
        html: newEmailHtml,
        logTag: "用户自助修改邮箱-新邮箱通知",
        checkQuota: true,
      })
        .then((result) => {
          if (result.success) {
            logger.info(`[用户自助修改邮箱-新邮箱通知] 成功发送到 ${rawEmail}`);
          } else {
            logger.warn(`[用户自助修改邮箱-新邮箱通知] 发送失败: ${rawEmail} - ${result.error}`);
          }
        })
        .catch((e) => {
          logger.warn(`[用户自助修改邮箱-新邮箱通知] 发送异常: ${rawEmail}`, e);
        });
    }

    const {
      password: _password,
      passwordHash: _passwordHash,
      passwordCiphertext: _passwordCiphertext,
      passwordIv: _passwordIv,
      passwordTag: _passwordTag,
      passwordKeyVersion: _passwordKeyVersion,
      ...safeUser
    } = updated as any;
    const resp = { ...safeUser };
    res.json(resp);
  } catch (e) {
    console.error("用户信息更新接口异常:", e);
    res.status(500).json({ error: "信息修改失败" });
  }
});

registerProfileAvatarRoutes(router);

registerProfileFingerprintRoutes(router);

export default router;
