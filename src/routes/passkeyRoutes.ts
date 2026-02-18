import express from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { PasskeyDataRepairService } from "../services/passkeyDataRepairService";
import { PasskeyService } from "../services/passkeyService";
import logger from "../utils/logger";
import { PasskeyCredentialIdFixer } from "../utils/passkeyCredentialIdFixer";
import { UserStorage } from "../utils/userStorage";

// 使用 require 避免类型声明解析问题
const adminOnly = require("../middleware/adminOnly").default;

const router = express.Router();

// 获取用户的 Passkey 凭证列表
router.get("/credentials", authenticateToken, async (req, res) => {
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
router.post("/register/start", authenticateToken, rateLimitMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { credentialName, clientOrigin } = req.body;
    const ip = req.headers["x-real-ip"] || req.ip || "unknown";
    logger.info("[Passkey] /register/start 收到请求", {
      userId,
      credentialName,
      clientOrigin,
      ip,
      headers: req.headers,
    });

    if (!credentialName || typeof credentialName !== "string") {
      logger.warn("[Passkey] credentialName 缺失或类型错误", { userId, credentialName, body: req.body });
      return res.status(400).json({
        error: "认证器名称是必需的",
        details: { credentialName, type: typeof credentialName, body: req.body },
      });
    }
    if (!userId || typeof userId !== "string") {
      logger.error("[Passkey] userId 缺失或类型错误", { userId, headers: req.headers });
      return res.status(401).json({ error: "用户未登录或 userId 异常", details: { userId, headers: req.headers } });
    }

    const user = await UserStorage.getUserById(userId);
    logger.info("[Passkey] /register/start 获取用户", { userId, user });
    if (!user) {
      logger.warn("[Passkey] 用户不存在", { userId });
      return res.status(404).json({ error: "用户不存在", details: { userId } });
    }
    if (!user.id || typeof user.id !== "string") {
      logger.error("[Passkey] user.id 缺失或类型错误", { user });
      return res.status(500).json({ error: "用户ID异常", details: { user } });
    }
    if (!user.username || typeof user.username !== "string") {
      logger.error("[Passkey] user.username 缺失或类型错误", { user });
      return res.status(500).json({ error: "用户名异常", details: { user } });
    }

    let options;
    try {
      options = await PasskeyService.generateRegistrationOptions(user, credentialName, clientOrigin);
    } catch (err) {
      logger.error("[Passkey] generateRegistrationOptions error", { userId, credentialName, clientOrigin, err });
      return res
        .status(500)
        .json({ error: "生成注册选项失败", details: err instanceof Error ? err.message : String(err) });
    }
    logger.info("[Passkey] /register/start options", { userId, options });

    // 记录本次 start 的简短 payload 以便管理员调试（只包含非敏感字段）
    try {
      const payload = {
        userId,
        credentialName,
        challenge: options.challenge,
        excludeCount: (user.passkeyCredentials || []).length,
      };
      const repairService = require("../services/passkeyDataRepairService");
      if (
        repairService?.PasskeyDataRepairService &&
        typeof repairService.PasskeyDataRepairService.setLastStartPayload === "function"
      ) {
        repairService.PasskeyDataRepairService.setLastStartPayload(payload);
      }
    } catch (err) {
      logger.warn("[Passkey] 记录 start payload 失败", { err });
    }
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
    });

    res.json({ options });
  } catch (error) {
    logger.error("生成 Passkey 注册选项失败", {
      error: error instanceof Error ? error.stack : error,
      body: req.body,
      headers: req.headers,
    });
    res
      .status(500)
      .json({ error: "生成 Passkey 注册选项失败", details: error instanceof Error ? error.message : String(error) });
  }
});

// 完成注册 Passkey
router.post("/register/finish", authenticateToken, rateLimitMiddleware, async (req, res) => {
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
    const requestOrigin = clientOrigin || req.headers.origin || req.headers.referer || "http://localhost:3001";
    const verification = await PasskeyService.verifyRegistration(
      user,
      response,
      credentialName,
      clientOrigin,
      requestOrigin,
    );
    // 注册成功后，返回最新的passkeyCredentials
    const updatedUser = await UserStorage.getUserById(userId);

    // 记录本次 finish 的简短 payload 以便管理员调试（只包含非敏感字段）
    try {
      const payload = {
        userId,
        credentialName,
        verified: verification?.verified,
        hasRegistrationInfo: !!verification?.registrationInfo,
      };
      const repairService = require("../services/passkeyDataRepairService");
      if (
        repairService?.PasskeyDataRepairService &&
        typeof repairService.PasskeyDataRepairService.setLastFinishPayload === "function"
      ) {
        repairService.PasskeyDataRepairService.setLastFinishPayload(payload);
      }
    } catch (err) {
      logger.warn("[Passkey] 记录 finish payload 失败", { err });
    }

    res.json({ ...verification, passkeyCredentials: updatedUser?.passkeyCredentials || [] });
  } catch (error) {
    console.error("完成 Passkey 注册失败:", error);
    res.status(500).json({ error: "完成 Passkey 注册失败" });
  }
});

// 开始认证（Discoverable Credentials - 无需用户名）
router.post("/authenticate/start/discoverable", rateLimitMiddleware, async (req, res) => {
  try {
    const { clientOrigin } = req.body;
    const ip = req.headers["x-real-ip"] || req.ip || "unknown";

    logger.info("[Passkey] /authenticate/start/discoverable 收到请求（无需用户名）", { clientOrigin, ip });

    // 生成不指定用户的认证选项
    const options = await PasskeyService.generateDiscoverableAuthenticationOptions(clientOrigin);

    logger.info("[Passkey] Discoverable 认证选项生成成功", {
      challenge: `${options.challenge?.substring(0, 20)}...`,
      hasAllowCredentials: !!options.allowCredentials,
    });

    // 将 challenge 临时存储到会话中（用于后续验证）
    // 注意：这里不能存储到用户记录中，因为还不知道是哪个用户
    res.json({ options, challenge: options.challenge });
  } catch (error: any) {
    logger.error("[Passkey] 生成 Discoverable 认证选项失败", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error?.message || "生成认证选项失败" });
  }
});

// 开始认证
router.post("/authenticate/start", rateLimitMiddleware, async (req, res) => {
  try {
    const { username, clientOrigin } = req.body;
    const ip = req.headers["x-real-ip"] || req.ip || "unknown";

    logger.info("[Passkey] /authenticate/start 收到请求", { username, clientOrigin, ip, headers: req.headers });

    if (!username) {
      logger.warn("[Passkey] 用户名缺失", { body: req.body });
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
      fullOptions: JSON.stringify(options, null, 2),
    });

    // 保存 challenge 到用户数据中
    await UserStorage.updateUser(user.id, {
      pendingChallenge: options.challenge,
    });

    res.json({ options });
  } catch (error: any) {
    logger.error("[Passkey] 生成认证选项失败", {
      error: error.message,
      stack: error.stack,
      body: req.body,
      username: req.body.username,
    });

    const errorMessage = error?.message || "生成 Passkey 认证选项失败";
    res.status(500).json({ error: errorMessage });
  }
});

// 完成认证（Discoverable Credentials - 无需用户名）
router.post("/authenticate/finish/discoverable", rateLimitMiddleware, async (req, res) => {
  try {
    const { response, challenge, clientOrigin } = req.body;

    if (!response) {
      return res.status(400).json({ error: "响应是必需的" });
    }

    logger.info("[Passkey] /authenticate/finish/discoverable 收到请求", {
      hasResponse: !!response,
      hasChallenge: !!challenge,
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

    // 设置用户的 pendingChallenge 以便验证
    if (challenge) {
      await UserStorage.updateUser(matchedUser.id, {
        pendingChallenge: challenge,
      });
    }

    // 执行Passkey验证
    const verification = await PasskeyService.verifyAuthentication(matchedUser, response, clientOrigin, clientOrigin);

    if (!verification.verified) {
      logger.warn("[Passkey] Discoverable 认证失败：验证未通过", {
        userId: matchedUser.id,
        username: matchedUser.username,
      });
      return res.status(401).json({ error: "Passkey验证失败" });
    }

    // 生成token并确保使用正确的用户信息
    const token = await PasskeyService.generateToken(matchedUser);

    // 验证生成的token包含正确的用户信息
    try {
      const jwt = require("jsonwebtoken");
      const config = require("../config/config").config;
      const decoded = jwt.verify(token, config.jwtSecret);

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
router.post("/authenticate/finish", rateLimitMiddleware, async (req, res) => {
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
    const requestOrigin = clientOrigin || req.headers.origin || req.headers.referer || "http://localhost:3001";

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
    const token = await PasskeyService.generateToken(user);

    // 验证生成的token包含正确的用户信息
    try {
      const jwt = require("jsonwebtoken");
      const config = require("../config/config").config;
      const decoded = jwt.verify(token, config.jwtSecret);

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

    // 如果是认证失败，尝试自动修复用户数据
    if (
      error?.message?.includes("验证认证响应失败") ||
      error?.message?.includes("找不到匹配的认证器") ||
      error?.message?.includes("Credential ID")
    ) {
      try {
        logger.info("[Passkey] 路由层检测到认证失败，尝试自动修复", {
          username: req.body.username,
          error: error.message,
        });

        // 重新获取用户数据
        const user = await UserStorage.getUserByUsername(req.body.username);
        if (user) {
          // 调用自动修复
          await PasskeyService.autoFixUserPasskeyData(user);

          logger.info("[Passkey] 路由层自动修复完成，建议用户重新尝试认证", {
            username: req.body.username,
            userId: user.id,
          });

          // 返回友好的错误信息，建议用户重新尝试
          return res.status(401).json({
            error: "认证失败，系统已自动修复数据，请重新尝试Passkey认证",
            code: "AUTO_FIXED",
            retry: true,
          });
        }
      } catch (fixError) {
        logger.error("[Passkey] 路由层自动修复失败:", {
          username: req.body.username,
          fixError: fixError instanceof Error ? fixError.message : String(fixError),
        });
      }
    }

    const errorMessage = error?.message || "完成 Passkey 认证失败";
    res.status(500).json({ error: errorMessage });
  }
});

// 删除 Passkey 凭证
router.delete("/credentials/:credentialId", authenticateToken, rateLimitMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { credentialId } = req.params;

    if (!credentialId) {
      return res.status(400).json({ error: "凭证ID是必需的" });
    }

    await PasskeyService.removeCredential(userId, credentialId);
    res.json({ success: true });
  } catch (error) {
    console.error("删除 Passkey 凭证失败:", error);
    res.status(500).json({ error: "删除 Passkey 凭证失败" });
  }
});

// 检查当前用户的Passkey数据状态（需要认证）
router.get("/data/check", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const result = await PasskeyDataRepairService.checkUserPasskeyData(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("[Passkey] 检查用户数据状态失败", {
      userId: (req as any).user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "检查数据状态失败" });
  }
});

// 修复当前用户的Passkey数据（需要认证）
router.post("/data/repair", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const result = await PasskeyDataRepairService.repairUserPasskeyData(userId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        repairedCredentialsCount: result.repairedCredentialsCount,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error("[Passkey] 修复用户数据失败", {
      userId: (req as any).user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "修复数据失败" });
  }
});

// 管理员接口：检查所有用户的Passkey数据状态（需要管理员权限）
router.get("/admin/data/check-all", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;

    // 检查管理员权限
    if (user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const allUsers = await UserStorage.getAllUsers();
    const results = [];

    for (const user of allUsers) {
      if (user.passkeyEnabled && user.passkeyCredentials && user.passkeyCredentials.length > 0) {
        const checkResult = await PasskeyDataRepairService.checkUserPasskeyData(user.id);
        results.push({
          userId: user.id,
          username: user.username,
          ...checkResult,
        });
      }
    }

    res.json({
      success: true,
      data: {
        totalUsers: allUsers.length,
        usersWithPasskey: results.length,
        results,
      },
    });
  } catch (error) {
    logger.error("[Passkey] 管理员检查所有用户数据失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "检查所有用户数据失败" });
  }
});

// 管理员接口：修复所有用户的Passkey数据（需要管理员权限）
router.post("/admin/data/repair-all", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;

    // 检查管理员权限
    if (user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    await PasskeyDataRepairService.repairAllUsersPasskeyData();

    res.json({
      success: true,
      message: "所有用户Passkey数据修复完成",
    });
  } catch (error) {
    logger.error("[Passkey] 管理员修复所有用户数据失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "修复所有用户数据失败" });
  }
});

// 修复当前用户的credentialID（需要认证）
router.post("/credential-id/fix", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const result = await PasskeyCredentialIdFixer.fixUserCredentialIds(userId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        fixedCredentials: result.fixedCredentials,
        totalCredentials: result.totalCredentials,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error("[Passkey] 修复用户credentialID失败", {
      userId: (req as any).user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "修复credentialID失败" });
  }
});

// 管理员调试路由：返回最近一次 start/finish 简短 payload（仅管理员）
router.get("/admin/debug/last-payloads", authenticateToken, adminOnly, async (_req, res) => {
  try {
    const repairService = require("../services/passkeyDataRepairService");
    if (
      repairService?.PasskeyDataRepairService &&
      typeof repairService.PasskeyDataRepairService.getLastPayloads === "function"
    ) {
      const payloads = repairService.PasskeyDataRepairService.getLastPayloads();
      return res.json({ success: true, data: payloads });
    }
    return res.status(500).json({ success: false, error: "调试服务不可用" });
  } catch (err) {
    logger.error("[Passkey] 获取调试 payload 失败", { err });
    return res.status(500).json({ success: false, error: "获取调试 payload 失败" });
  }
});

// 检查当前用户的credentialID状态（需要认证）
router.get("/credential-id/check", authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const user = await UserStorage.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: "用户不存在" });
    }

    if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
      return res.json({
        success: true,
        hasPasskey: false,
        message: "用户未启用Passkey或无凭证",
      });
    }

    const credentialInfo = user.passkeyCredentials.map((cred, index) => ({
      index,
      credentialId: cred.credentialID,
      ...PasskeyCredentialIdFixer.getCredentialIdInfo(cred.credentialID),
    }));

    const validCredentials = credentialInfo.filter((info) => info.isValid);
    const invalidCredentials = credentialInfo.filter((info) => !info.isValid);

    res.json({
      success: true,
      hasPasskey: true,
      totalCredentials: user.passkeyCredentials.length,
      validCredentials: validCredentials.length,
      invalidCredentials: invalidCredentials.length,
      needsFix: invalidCredentials.length > 0,
      credentialDetails: credentialInfo,
    });
  } catch (error) {
    logger.error("[Passkey] 检查用户credentialID状态失败", {
      userId: (req as any).user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "检查credentialID状态失败" });
  }
});

// 管理员接口：修复所有用户的credentialID（需要管理员权限）
router.post("/admin/credential-id/fix-all", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;

    // 检查管理员权限
    if (user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await PasskeyCredentialIdFixer.fixAllUsersCredentialIds();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        totalUsers: result.totalUsers,
        fixedUsers: result.fixedUsers,
        totalFixedCredentials: result.totalFixedCredentials,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    logger.error("[Passkey] 管理员修复所有用户credentialID失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "修复所有用户credentialID失败" });
  }
});

export default router;
