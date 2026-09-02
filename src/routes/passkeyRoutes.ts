import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/routeLimiters";
import { sendEmail } from "../services/emailSender";
import { PasskeyService, SINGLE_PASSKEY_ERROR_MESSAGE } from "../services/passkeyService";
import { generatePasskeyAddedEmailHtml, generatePasskeyRemovedEmailHtml } from "../templates/emailTemplates";
import { getClientIP } from "../utils/ipUtils";
import { sanitizeLogValue } from "../utils/requestLogSanitizer";
import { getAuthSessionMetadata } from "../services/authSessionService";
import logger from "../utils/logger";
import { firstString } from "../utils/httpParam";
import { UserStorage } from "../utils/userStorage";
import { registerPasskeyMaintenanceRoutes } from "./passkeyRoutes.maintenance";

// 服务端 challenge 存储（用于 discoverable 认证流程）
// 防止客户端控制 expectedChallenge 导致重放攻击
const discoverableChallengeStore = new Map<string, { challenge: string; expiresAt: number }>();
// G2-19: 容量上限，防内存无限增长
const MAX_DISCOVERABLE_CHALLENGE_KEYS = 5000;
// 定期清理过期 challenge（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of discoverableChallengeStore) {
    if (now >= value.expiresAt) {
      discoverableChallengeStore.delete(key);
    }
  }
  if (discoverableChallengeStore.size > MAX_DISCOVERABLE_CHALLENGE_KEYS) {
    const ordered = [...discoverableChallengeStore.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (const [key] of ordered.slice(0, discoverableChallengeStore.size - MAX_DISCOVERABLE_CHALLENGE_KEYS)) {
      discoverableChallengeStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

const router = express.Router();

// Route-level limiters defined in this file so static analysis can see express-rate-limit usage.
const passkeyAuthLimiter = createLimiter({
  name: "passkeyAuth",
  profile: "verification",
  category: "verification",
  max: 30,
  message: "Passkey操作过于频繁，请稍后再试",
});
const passkeyAdminLimiter = createLimiter({
  name: "passkeyAdmin",
  profile: "admin",
  category: "admin",
  max: 30,
  message: "Passkey管理操作过于频繁，请稍后再试",
});

// 获取用户的 Passkey 凭证列表
router.get("/credentials", passkeyAuthLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const credentials = await PasskeyService.getCredentials(userId);
    res.json(credentials);
  } catch (error) {
    console.error("获取 Passkey 凭证列表失败:", error);
    res.status(500).json({ error: "获取 Passkey 凭证列表失败" });
  }
});

// 开始注册 Passkey
router.post("/register/start", passkeyAuthLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { credentialName, clientOrigin } = req.body;
    const ip = getClientIP(req);
    logger.info("[Passkey] /register/start 收到请求", {
      userId,
      credentialName,
      clientOrigin,
      ip,
      headers: sanitizeLogValue(req.headers),
    });

    if (!credentialName || typeof credentialName !== "string") {
      logger.warn("[Passkey] credentialName 缺失或类型错误", {
        userId,
        credentialName,
        body: sanitizeLogValue(req.body),
      });
      return res.status(400).json({
        error: "认证器名称是必需的",
        details: { credentialName, type: typeof credentialName, body: sanitizeLogValue(req.body) },
      });
    }
    if (!userId || typeof userId !== "string") {
      logger.error("[Passkey] userId 缺失或类型错误", { userId, headers: sanitizeLogValue(req.headers) });
      return res.status(401).json({
        error: "用户未登录或 userId 异常",
        details: { userId, headers: sanitizeLogValue(req.headers) },
      });
    }

    const user = await UserStorage.getUserById(userId);
    logger.info("[Passkey] /register/start 获取用户", { userId, user: sanitizeLogValue(user) });
    if (!user) {
      logger.warn("[Passkey] 用户不存在", { userId });
      return res.status(404).json({ error: "用户不存在", details: { userId } });
    }
    if (!user.id || typeof user.id !== "string") {
      logger.error("[Passkey] user.id 缺失或类型错误", { user: sanitizeLogValue(user) });
      return res.status(500).json({ error: "用户ID异常", details: { user: sanitizeLogValue(user) } });
    }
    if (!user.username || typeof user.username !== "string") {
      logger.error("[Passkey] user.username 缺失或类型错误", { user: sanitizeLogValue(user) });
      return res.status(500).json({ error: "用户名异常", details: { user: sanitizeLogValue(user) } });
    }

    if ((user.passkeyCredentials || []).length > 0) {
      logger.warn("[Passkey] 拒绝重复注册 Passkey", {
        userId,
        credentialsCount: user.passkeyCredentials?.length || 0,
      });
      return res.status(400).json({ error: SINGLE_PASSKEY_ERROR_MESSAGE });
    }

    let options;
    try {
      options = await PasskeyService.generateRegistrationOptions(user, credentialName, clientOrigin);
    } catch (err) {
      if (err instanceof Error && err.message === SINGLE_PASSKEY_ERROR_MESSAGE) {
        return res.status(400).json({ error: err.message });
      }
      logger.error("[Passkey] generateRegistrationOptions error", { userId, credentialName, clientOrigin, err });
      return res
        .status(500)
        .json({ error: "生成注册选项失败", details: err instanceof Error ? err.message : String(err) });
    }
    logger.info("[Passkey] /register/start options", { userId, options });

    if (!options) {
      logger.error("[Passkey] options 为 undefined", { userId, credentialName });
      return res.status(500).json({ error: "生成注册选项失败", details: { userId, credentialName, options } });
    }
    if (!options.challenge) {
      logger.error("[Passkey] options.challenge 为 undefined", { userId, credentialName, options });
      return res.status(500).json({ error: "生成注册选项失败", details: { userId, credentialName, options } });
    }

    await UserStorage.updateUser(userId, {
      pendingChallenge: options.challenge,
      pendingChallengeExpiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ options });
  } catch (error) {
    logger.error("生成 Passkey 注册选项失败", {
      error: error instanceof Error ? error.stack : error,
      body: sanitizeLogValue(req.body),
      headers: sanitizeLogValue(req.headers),
    });
    res
      .status(500)
      .json({ error: "生成 Passkey 注册选项失败", details: error instanceof Error ? error.message : String(error) });
  }
});

// 完成注册 Passkey
router.post("/register/finish", passkeyAuthLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { credentialName, response, clientOrigin } = req.body;
    if (!credentialName || !response) {
      return res.status(400).json({ error: "认证器名称和响应是必需的" });
    }
    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }
    // 优先使用 clientOrigin，其次自动获取请求origin
    if ((user.passkeyCredentials || []).length > 0) {
      logger.warn("[Passkey] 拒绝重复完成 Passkey 注册", {
        userId,
        credentialsCount: user.passkeyCredentials?.length || 0,
      });
      return res.status(400).json({ error: SINGLE_PASSKEY_ERROR_MESSAGE });
    }
    const requestOrigin = clientOrigin || req.headers.origin || req.headers.referer || "https://tts.chloemlla.com";
    const verification = await PasskeyService.verifyRegistration(
      user,
      response,
      credentialName,
      clientOrigin,
      requestOrigin,
    );
    // 注册成功后，返回最新的passkeyCredentials
    const updatedUser = await UserStorage.getUserById(userId);

    // 发送邮件通知
    if (verification?.verified && updatedUser) {
      try {
        const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const ip = getClientIP(req);
        const device = req.headers["user-agent"] || "unknown";
        const emailHtml = generatePasskeyAddedEmailHtml(updatedUser.username, credentialName, time, ip, device);
        sendEmail({
          to: updatedUser.email,
          subject: "Synapse 已成功添加 Passkey",
          html: emailHtml,
          logTag: "Passkey添加通知",
          checkQuota: true,
        })
          .then((result) => {
            if (result.success) {
              logger.info(`[Passkey添加通知] 成功发送到 ${updatedUser.email}`);
            } else {
              logger.warn(`[Passkey添加通知] 发送失败: ${updatedUser.email} - ${result.error}`);
            }
          })
          .catch((e) => {
            logger.warn(`[Passkey添加通知] 发送异常: ${updatedUser.email}`, e);
          });
      } catch (notifyErr) {
        logger.warn("[Passkey添加通知] 发送通知邮件失败:", notifyErr);
      }
    }

    res.json({ ...verification, passkeyCredentials: updatedUser?.passkeyCredentials || [] });
  } catch (error) {
    if (error instanceof Error && error.message === SINGLE_PASSKEY_ERROR_MESSAGE) {
      return res.status(400).json({ error: error.message });
    }
    console.error("完成 Passkey 注册失败:", error);
    res.status(500).json({ error: "完成 Passkey 注册失败" });
  }
});

// 开始认证（Discoverable Credentials - 无需用户名）
router.post("/authenticate/start/discoverable", passkeyAuthLimiter, async (req, res) => {
  try {
    const { clientOrigin } = req.body;
    const ip = getClientIP(req);

    logger.info("[Passkey] /authenticate/start/discoverable 收到请求（无需用户名）", { clientOrigin, ip });

    // 生成不指定用户的认证选项
    const options = await PasskeyService.generateDiscoverableAuthenticationOptions(clientOrigin);

    logger.info("[Passkey] Discoverable 认证选项生成成功", {
      challenge: `${options.challenge?.substring(0, 20)}...`,
      hasAllowCredentials: !!options.allowCredentials,
    });

    // 将 challenge 存储到服务端内存中，防止客户端控制 expectedChallenge 导致重放攻击
    const challengeId = crypto.randomBytes(16).toString("hex");
    discoverableChallengeStore.set(challengeId, {
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 分钟过期
    });

    res.json({ options, challenge: options.challenge, challengeId });
  } catch (error: any) {
    logger.error("[Passkey] 生成 Discoverable 认证选项失败", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error?.message || "生成认证选项失败" });
  }
});

// 开始认证
router.post("/authenticate/start", passkeyAuthLimiter, async (req, res) => {
  try {
    const { username, clientOrigin } = req.body;
    const ip = getClientIP(req);

    logger.info("[Passkey] /authenticate/start 收到请求", {
      username,
      clientOrigin,
      ip,
      headers: sanitizeLogValue(req.headers),
    });

    if (!username) {
      logger.warn("[Passkey] 用户名缺失", { body: sanitizeLogValue(req.body) });
      return res.status(400).json({ error: "用户名是必需的" });
    }

    const user = await UserStorage.getUserByUsername(username);
    if (!user) {
      logger.warn("[Passkey] 用户不存在", { username });
      return res.status(404).json({ error: "用户不存在" });
    }

    logger.info("[Passkey] 获取用户信息", {
      userId: user.id,
      username: user.username,
      passkeyEnabled: user.passkeyEnabled,
      credentialsCount: user.passkeyCredentials?.length || 0,
      searchUsername: username,
    });

    if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
      logger.warn("[Passkey] 用户未启用Passkey或无凭证", {
        userId: user.id,
        passkeyEnabled: user.passkeyEnabled,
        credentialsCount: user.passkeyCredentials?.length || 0,
      });
      return res.status(400).json({ error: "用户未启用 Passkey 或没有注册的凭证" });
    }

    const options = await PasskeyService.generateAuthenticationOptions(user, clientOrigin);

    logger.info("[Passkey] 生成认证选项成功", {
      userId: user.id,
      challenge: `${options.challenge?.substring(0, 20)}...`,
      allowCredentialsCount: options.allowCredentials?.length || 0,
    });

    // 保存 challenge 到用户数据中（G2-11: 带过期时间）
    await UserStorage.updateUser(user.id, {
      pendingChallenge: options.challenge,
      pendingChallengeExpiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ options });
  } catch (error: any) {
    logger.error("[Passkey] 生成认证选项失败", {
      error: error.message,
      stack: error.stack,
      body: sanitizeLogValue(req.body),
      username: req.body.username,
    });

    const errorMessage = error?.message || "生成 Passkey 认证选项失败";
    res.status(500).json({ error: errorMessage });
  }
});

// 完成认证（Discoverable Credentials - 无需用户名）
router.post("/authenticate/finish/discoverable", passkeyAuthLimiter, async (req, res) => {
  try {
    const { response, challengeId, clientOrigin } = req.body;

    if (!response) {
      return res.status(400).json({ error: "响应是必需的" });
    }

    // 优先使用服务端存储的 challenge（防止客户端控制 expectedChallenge 导致重放攻击）
    let expectedChallenge: string | undefined;
    if (challengeId && discoverableChallengeStore.has(challengeId)) {
      const stored = discoverableChallengeStore.get(challengeId)!;
      if (Date.now() < stored.expiresAt) {
        expectedChallenge = stored.challenge;
      }
      discoverableChallengeStore.delete(challengeId);
    }

    // 不再回退到客户端提交的 challenge：强制使用服务端签发的 challengeId，
    // 避免客户端控制 expectedChallenge 导致认证响应重放。
    if (!expectedChallenge) {
      return res.status(400).json({ error: "challengeId 无效或已过期，请重新发起认证" });
    }

    logger.info("[Passkey] /authenticate/finish/discoverable 收到请求", {
      hasResponse: !!response,
      hasChallenge: !!challengeId,
      responseKeys: Object.keys(response),
      credentialId: `${response.id?.substring(0, 20)}...`,
    });

    // 根据 credential ID 查找用户
    const credentialId = response.id || response.rawId;
    if (!credentialId) {
      return res.status(400).json({ error: "缺少 credential ID" });
    }

    // 遍历所有用户，查找匹配的凭证
    const allUsers = await UserStorage.getAllUsers();
    let matchedUser: any = null;

    for (const user of allUsers) {
      if (user.passkeyEnabled && user.passkeyCredentials && user.passkeyCredentials.length > 0) {
        const matchedCred = user.passkeyCredentials.find((cred: any) => {
          // 尝试多种比较方式
          return (
            cred.credentialID === credentialId ||
            cred.id === credentialId ||
            cred.credentialID === response.id ||
            cred.id === response.id
          );
        });

        if (matchedCred) {
          matchedUser = user;
          logger.info("[Passkey] 找到匹配的用户", {
            userId: user.id,
            username: user.username,
            credentialId: `${credentialId.substring(0, 20)}...`,
          });
          break;
        }
      }
    }

    if (!matchedUser) {
      logger.warn("[Passkey] Discoverable 认证失败：未找到匹配的用户", {
        credentialId: `${credentialId.substring(0, 20)}...`,
      });
      return res.status(404).json({ error: "未找到匹配的凭证" });
    }

    // 验证用户是否启用了Passkey
    if (!matchedUser.passkeyEnabled) {
      logger.warn("[Passkey] Discoverable 认证失败：用户未启用Passkey", {
        userId: matchedUser.id,
        username: matchedUser.username,
      });
      return res.status(400).json({ error: "用户未启用Passkey" });
    }

    // G2-11: 不写受害者文档。直接把服务端验证的 challenge 作为参数传入 verifyAuthentication，
    // 避免远程覆盖其他用户进行中的登录 challenge（登录 DoS）。
    const verification = await PasskeyService.verifyAuthentication(
      matchedUser,
      response,
      clientOrigin,
      clientOrigin,
      expectedChallenge,
    );

    if (!verification.verified) {
      logger.warn("[Passkey] Discoverable 认证失败：验证未通过", {
        userId: matchedUser.id,
        username: matchedUser.username,
      });
      return res.status(401).json({ error: "Passkey验证失败" });
    }

    // 生成token并确保使用正确的用户信息
    const token = await PasskeyService.generateToken(matchedUser, getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }));

    // 验证生成的token包含正确的用户信息
    try {
      const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { userId: string; username: string };

      if (decoded.userId !== matchedUser.id || decoded.username !== matchedUser.username) {
        logger.error("[Passkey] Discoverable Token生成错误：用户信息不匹配", {
          username: matchedUser.username,
          userId: matchedUser.id,
          tokenUserId: decoded.userId,
          tokenUsername: decoded.username,
        });
        return res.status(500).json({ error: "Token生成失败" });
      }

      logger.info("[Passkey] Discoverable 认证成功，Token验证通过", {
        username: matchedUser.username,
        userId: matchedUser.id,
        tokenUserId: decoded.userId,
        tokenUsername: decoded.username,
      });
    } catch (tokenError) {
      logger.error("[Passkey] Discoverable Token验证失败", {
        username: matchedUser.username,
        userId: matchedUser.id,
        error: tokenError instanceof Error ? tokenError.message : String(tokenError),
      });
      return res.status(500).json({ error: "Token生成失败" });
    }

    // 返回成功响应，确保用户信息正确
    res.json({
      success: true,
      token: token,
      user: {
        id: matchedUser.id,
        username: matchedUser.username,
        email: matchedUser.email,
      },
    });
  } catch (error: any) {
    logger.error("[Passkey] Discoverable 认证失败:", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error?.message || "完成认证失败" });
  }
});

// 完成认证
router.post("/authenticate/finish", passkeyAuthLimiter, async (req, res) => {
  try {
    const { username, response, clientOrigin } = req.body;
    if (!username || !response) {
      return res.status(400).json({ error: "用户名和响应是必需的" });
    }

    // 调试日志：记录接收到的响应对象
    logger.info("[Passkey] /authenticate/finish 收到请求", {
      username,
      clientOrigin,
      responseKeys: Object.keys(response),
      hasId: !!response.id,
      hasRawId: !!response.rawId,
      hasResponse: !!response.response,
      type: response.type,
      idLength: response.id?.length,
      rawIdType: typeof response.rawId,
      idValue: `${response.id?.substring(0, 20)}...`,
      fullResponse: JSON.stringify(response, null, 2),
    });

    // 查找用户并验证用户名匹配
    const user = await UserStorage.getUserByUsername(username);
    if (!user) {
      logger.warn("[Passkey] 认证失败：用户不存在", { username });
      return res.status(404).json({ error: "用户不存在" });
    }

    // 验证用户是否启用了Passkey
    if (!user.passkeyEnabled || !Array.isArray(user.passkeyCredentials) || user.passkeyCredentials.length === 0) {
      logger.warn("[Passkey] 认证失败：用户未启用Passkey", {
        username,
        userId: user.id,
        passkeyEnabled: user.passkeyEnabled,
        credentialsCount: user.passkeyCredentials?.length || 0,
      });
      return res.status(400).json({ error: "用户未启用Passkey" });
    }

    // 验证用户名与用户ID的一致性
    if (user.username !== username) {
      logger.error("[Passkey] 认证失败：用户名与用户数据不匹配", {
        providedUsername: username,
        actualUsername: user.username,
        userId: user.id,
      });
      return res.status(400).json({ error: "用户名验证失败" });
    }

    // 优先使用 clientOrigin，其次自动获取请求origin
    const requestOrigin = clientOrigin || req.headers.origin || req.headers.referer || "https://tts.chloemlla.com";

    // 执行Passkey验证
    const verification = await PasskeyService.verifyAuthentication(user, response, clientOrigin, requestOrigin);

    if (!verification.verified) {
      logger.warn("[Passkey] 认证失败：验证未通过", {
        username,
        userId: user.id,
      });
      return res.status(401).json({ error: "Passkey验证失败" });
    }

    // 生成token并确保使用正确的用户信息
    const token = await PasskeyService.generateToken(user, getAuthSessionMetadata(req, { ipAddress: getClientIP(req) }));

    // 验证生成的token包含正确的用户信息
    try {
      const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as { userId: string; username: string };

      if (decoded.userId !== user.id || decoded.username !== user.username) {
        logger.error("[Passkey] Token生成错误：用户信息不匹配", {
          username,
          userId: user.id,
          tokenUserId: decoded.userId,
          tokenUsername: decoded.username,
        });
        return res.status(500).json({ error: "Token生成失败" });
      }

      logger.info("[Passkey] 认证成功，Token验证通过", {
        username,
        userId: user.id,
        tokenUserId: decoded.userId,
        tokenUsername: decoded.username,
      });
    } catch (tokenError) {
      logger.error("[Passkey] Token验证失败", {
        username,
        userId: user.id,
        error: tokenError instanceof Error ? tokenError.message : String(tokenError),
      });
      return res.status(500).json({ error: "Token生成失败" });
    }

    // 返回成功响应，确保用户信息正确
    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error("完成 Passkey 认证失败:", error);

    // G2-09: 认证路径绝不自动改写/删除用户凭证数据。
    // 需要修复走显式入口：超管 POST /api/passkey/admin/data/repair-all。
    const errorMessage = error?.message || "完成 Passkey 认证失败";
    res.status(500).json({ error: errorMessage });
  }
});

// 删除 Passkey 凭证
router.delete("/credentials/:credentialId", passkeyAuthLimiter, authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const credentialId = firstString(req.params.credentialId);

    if (!credentialId) {
      return res.status(400).json({ error: "凭证ID是必需的" });
    }

    const user = await UserStorage.getUserById(userId);
    await PasskeyService.removeCredential(userId, credentialId);

    // 发送邮件通知
    if (user) {
      try {
        const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const ip = getClientIP(req);
        const device = req.headers["user-agent"] || "unknown";
        const emailHtml = generatePasskeyRemovedEmailHtml(user.username, time, ip, device);
        sendEmail({
          to: user.email,
          subject: "Synapse Passkey 已移除",
          html: emailHtml,
          logTag: "Passkey移除通知",
          checkQuota: true,
        })
          .then((result) => {
            if (result.success) {
              logger.info(`[Passkey移除通知] 成功发送到 ${user.email}`);
            } else {
              logger.warn(`[Passkey移除通知] 发送失败: ${user.email} - ${result.error}`);
            }
          })
          .catch((e) => {
            logger.warn(`[Passkey移除通知] 发送异常: ${user.email}`, e);
          });
      } catch (notifyErr) {
        logger.warn("[Passkey移除通知] 发送通知邮件失败:", notifyErr);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("删除 Passkey 凭证失败:", error);
    res.status(500).json({ error: "删除 Passkey 凭证失败" });
  }
});

registerPasskeyMaintenanceRoutes(router, passkeyAuthLimiter, passkeyAdminLimiter);

export default router;
