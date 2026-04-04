import * as crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { adminController } from "../controllers/adminController";
import { auditLog } from "../middleware/auditLog";
import { authenticateToken } from "../middleware/authenticateToken";
import { authMiddleware } from "../middleware/authMiddleware";
import { replayProtection } from "../middleware/replayProtection";
import logger from "../utils/logger";

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB限制

const router = express.Router();

// 管理员路由限流器（每IP每分钟50次）
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: "管理员操作过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.ip || req.socket?.remoteAddress || "unknown",
  skip: (req: any) => req.isLocalIp || false,
});

// 管理员清空指定用户的全部指纹记录（需管理员权限）
router.delete("/users/:id/fingerprints", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });

    const { getUserById, updateUser } = require("../services/userService");
    const target = await getUserById(userId);
    if (!target) return res.status(404).json({ error: "用户不存在" });

    await updateUser(userId, { fingerprints: [] } as any);
    return res.json({ success: true, fingerprints: [] });
  } catch (e) {
    console.error("清空指纹失败", e);
    return res.status(500).json({ error: "清空指纹失败" });
  }
});

// 管理员权限检查中间件
const adminAuthMiddleware = (req: any, res: any, next: any) => {
  // 允许普通已登录用户访问的用户自助接口（在本路由前缀 /api/admin 下）
  // 注意：这里匹配的是路由内的路径（不含前缀），例如 '/user/profile'
  const userSelfServicePaths = new Set<string>([
    "/user/profile",
    "/user/avatar",
    "/user/avatar/exist",
    "/user/fingerprint",
  ]);

  if (userSelfServicePaths.has(req.path)) {
    return next();
  }

  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }
  next();
};

// 启动时清理所有用户的avatarBase64字段，只保留avatarUrl
import { UserStorage } from "../utils/userStorage";

(async () => {
  try {
    const users = await UserStorage.getAllUsers();
    for (const user of users) {
      if ((user as any).avatarBase64) {
        await UserStorage.updateUser(user.id, { avatarBase64: undefined } as any);
      }
    }
  } catch (e) {
    console.warn("启动时清理avatarBase64字段失败", e);
  }
})();

// 公告读取接口移到最前面，不加任何中间件
router.get("/announcement", adminController.getAnnouncement);

// 其余路由依然加auth
router.use(authMiddleware);
router.use(adminAuthMiddleware);
router.use(adminLimiter); // 已登录管理员不再限速

// 在所有已认证/管理员路由上，若用户被标记为需要上报指纹，则通知前端（带去重 hash）
router.use(async (req: any, res: any, next: any) => {
  try {
    if (req.user?.id) {
      const { getUserById } = require("../services/userService");
      const current = await getUserById(req.user.id);
      if (current && (current as any).requireFingerprint) {
        // 生成去重 hash，前端收到后通过 WS 回传确认，避免与 WS 推送双重触发
        const { wsService } = require("../services/wsService");
        const hash = wsService.notifyFingerprintRequired(req.user.id, true);
        res.setHeader("X-Require-Fingerprint", "1");
        res.setHeader("X-Fingerprint-Hash", hash);
      }
    }
  } catch (_e) {
    // 静默失败，不影响主流程
  }
  next();
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     summary: 获取用户列表
 *     responses:
 *       200:
 *         description: 用户列表
 */
router.get("/users", adminController.getUsers);
router.get("/users/:id", adminController.getUser);

/**
 * @openapi
 * /admin/users:
 *   post:
 *     summary: 创建用户
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
 *         description: 创建用户结果
 */
router.post(
  "/users",
  auditLog({
    module: "user",
    action: "user.create",
    extractDetail: (req) => ({ username: req.body.username, email: req.body.email }),
  }),
  adminController.createUser,
);

// 管理员设置指定用户下次需要上报指纹（一次性或开关）
router.post("/users/:id/fingerprint/require", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });
    const { require: requireFlag } = req.body || {};
    const enabled = !!requireFlag;
    const { getUserById, updateUser } = require("../services/userService");
    const target = await getUserById(userId);
    if (!target) return res.status(404).json({ error: "用户不存在" });
    const updates: any = { requireFingerprint: enabled };
    if (enabled) {
      updates.requireFingerprintAt = Date.now();
    } else {
      updates.requireFingerprintAt = 0;
    }
    await updateUser(userId, updates as any);

    // 通过 WebSocket 实时推送指纹通知，带去重 hash
    const { wsService } = require("../services/wsService");
    const hash = wsService.notifyFingerprintRequired(userId, enabled);

    return res.json({
      success: true,
      requireFingerprint: enabled,
      requireFingerprintAt: updates.requireFingerprintAt,
      hash, // 去重 hash，前端可用于 HTTP/WS 去重
    });
  } catch (e) {
    console.error("设置指纹上报需求失败", e);
    return res.status(500).json({ error: "设置失败" });
  }
});

/**
 * @openapi
 * /admin/users/{id}:
 *   put:
 *     summary: 更新用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: 更新用户结果
 */
router.put(
  "/users/:id",
  auditLog({ module: "user", action: "user.update", extractTarget: (req) => ({ targetId: req.params.id }) }),
  adminController.updateUser,
);

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 删除用户结果
 */
router.delete(
  "/users/:id",
  auditLog({ module: "user", action: "user.delete", extractTarget: (req) => ({ targetId: req.params.id }) }),
  adminController.deleteUser,
);

router.get("/translation-logs", adminController.getTranslationLogs);
router.get("/translation-logs/stats", adminController.getTranslationLogStats);
router.post(
  "/users/:id/translation-penalty",
  auditLog({
    module: "user",
    action: "user.translationPenalty",
    extractTarget: (req) => ({ targetId: req.params.id }),
    extractDetail: (req) => ({ action: req.body?.action, until: req.body?.until }),
  }),
  adminController.applyTranslationPenalty,
);

/**
 * @openapi
 * /admin/announcement:
 *   post:
 *     summary: 设置/更新公告
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               format:
 *                 type: string
 *     responses:
 *       200:
 *         description: 设置结果
 */
router.post(
  "/announcement",
  auditLog({ module: "announcement", action: "announcement.update" }),
  adminController.setAnnouncement,
);

/**
 * @openapi
 * /admin/announcement:
 *   delete:
 *     summary: 删除所有公告
 *     responses:
 *       200:
 *         description: 删除结果
 */
router.delete(
  "/announcement",
  auditLog({ module: "announcement", action: "announcement.delete" }),
  adminController.deleteAnnouncements,
);

/**
 * @openapi
 * /admin/envs:
 *   get:
 *     summary: 获取所有环境变量
 *     responses:
 *       200:
 *         description: 环境变量列表
 */
router.get("/envs", adminController.getEnvs);

/**
 * @openapi
 * /admin/envs:
 *   post:
 *     summary: 新增或更新环境变量
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *               desc:
 *                 type: string
 *     responses:
 *       200:
 *         description: 保存结果
 */
router.post(
  "/envs",
  auditLog({ module: "env", action: "env.set", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.setEnv,
);

/**
 * @openapi
 * /admin/envs:
 *   delete:
 *     summary: 删除环境变量
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *     responses:
 *       200:
 *         description: 删除结果
 */
router.delete(
  "/envs",
  auditLog({ module: "env", action: "env.delete", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.deleteEnv,
);

/**
 * @openapi
 * /admin/envs/delete:
 *   post:
 *     summary: 删除环境变量
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *     responses:
 *       200:
 *         description: 删除结果
 */
router.post(
  "/envs/delete",
  auditLog({ module: "env", action: "env.delete", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.deleteEnv,
);

// OutEmail settings management (admin)
router.get("/outemail/settings", adminController.getOutemailSettings);
router.post("/outemail/settings", adminController.setOutemailSetting);
router.delete("/outemail/settings", adminController.deleteOutemailSetting);

// Modlist MODIFY_CODE management (admin)
router.get("/modlist/setting", adminController.getModlistSetting);
router.post("/modlist/setting", adminController.setModlistSetting);
router.delete("/modlist/setting", adminController.deleteModlistSetting);

// TTS GENERATION_CODE management (admin)
router.get("/tts/setting", adminController.getTtsSetting);
router.post("/tts/setting", adminController.setTtsSetting);
router.delete("/tts/setting", adminController.deleteTtsSetting);

// Runtime config management (admin)
router.get("/ipqs/setting", adminController.getIpqsSetting);
router.post("/ipqs/setting", adminController.setIpqsSetting);
router.delete("/ipqs/setting", adminController.deleteIpqsSetting);
router.get("/linuxdo/setting", adminController.getLinuxDoSetting);
router.post("/linuxdo/setting", adminController.setLinuxDoSetting);
router.delete("/linuxdo/setting", adminController.deleteLinuxDoSetting);
router.get("/google-auth/setting", adminController.getGoogleAuthSetting);
router.post("/google-auth/setting", adminController.setGoogleAuthSetting);
router.delete("/google-auth/setting", adminController.deleteGoogleAuthSetting);
router.get("/deeplx/setting", adminController.getDeepLXSetting);
router.post("/deeplx/setting", adminController.setDeepLXSetting);
router.delete("/deeplx/setting", adminController.deleteDeepLXSetting);
router.get("/nexai/setting", adminController.getNexaiSetting);
router.post("/nexai/setting", adminController.setNexaiSetting);
router.delete("/nexai/setting", adminController.deleteNexaiSetting);

// Webhook Secret management (admin)
router.get("/webhook/secret", adminController.getWebhookSecret);
router.post("/webhook/secret", adminController.setWebhookSecret);
router.delete("/webhook/secret", adminController.deleteWebhookSecret);

// 短链管理API
router.get("/shortlinks", authenticateToken, async (req, res) => {
  try {
    console.log("🔐 [ShortLinkManager] 开始处理短链列表加密请求...");
    console.log("   用户ID:", req.user?.id);
    console.log("   用户名:", req.user?.username);
    console.log("   用户角色:", req.user?.role);
    console.log("   请求IP:", req.ip);

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      console.log("❌ [ShortLinkManager] 权限检查失败：非管理员用户");
      return res.status(403).json({ error: "需要管理员权限" });
    }

    console.log("✅ [ShortLinkManager] 权限检查通过");

    // 获取管理员token作为加密密钥
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ [ShortLinkManager] Token格式错误：未携带Token或格式不正确");
      return res.status(401).json({ error: "未携带Token，请先登录" });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    if (!token) {
      console.log("❌ [ShortLinkManager] Token为空");
      return res.status(401).json({ error: "Token为空" });
    }

    console.log("✅ [ShortLinkManager] Token获取成功，长度:", token.length);

    // 输入验证和清理
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || "10"), 10) || 10));

    const ShortUrlModel = require("mongoose").models.ShortUrl || require("mongoose").model("ShortUrl");

    // 安全的查询构建
    let query: any = {};
    if (search && search.length > 0) {
      // 防止正则表达式注入：转义特殊字符
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query = {
        $or: [{ code: { $regex: escapedSearch, $options: "i" } }, { target: { $regex: escapedSearch, $options: "i" } }],
      };
    }

    const total = await ShortUrlModel.countDocuments(query);
    const items = await ShortUrlModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    console.log("📊 [ShortLinkManager] 获取到短链数量:", items.length);
    console.log("   总数:", total);

    // 准备加密数据
    const responseData = { total, items };
    const jsonData = JSON.stringify(responseData);
    console.log("📝 [ShortLinkManager] JSON数据准备完成，长度:", jsonData.length);

    // 使用AES-256-CBC加密数据
    console.log("🔐 [ShortLinkManager] 开始AES-256-CBC加密...");
    const algorithm = "aes-256-cbc";

    // 生成密钥
    console.log("   生成密钥...");
    const key = crypto.createHash("sha256").update(token).digest();
    console.log("   密钥生成完成，长度:", key.length);

    // 生成IV
    console.log("   生成初始化向量(IV)...");
    const iv = crypto.randomBytes(16);
    console.log("   IV生成完成，长度:", iv.length);
    console.log("   IV (hex):", iv.toString("hex"));

    // 创建加密器
    console.log("   创建加密器...");
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    // 执行加密
    console.log("   开始加密数据...");
    let encrypted = cipher.update(jsonData, "utf8", "hex");
    encrypted += cipher.final("hex");

    console.log("✅ [ShortLinkManager] 加密完成");
    console.log("   原始数据长度:", jsonData.length);
    console.log("   加密后数据长度:", encrypted.length);
    console.log("   加密算法:", algorithm);
    console.log("   密钥长度:", key.length);
    console.log("   IV长度:", iv.length);

    // 返回加密后的数据
    const response = {
      success: true,
      data: encrypted,
      iv: iv.toString("hex"),
    };

    console.log("📤 [ShortLinkManager] 准备返回加密数据");
    console.log("   响应数据大小:", JSON.stringify(response).length);

    res.json(response);

    console.log("✅ [ShortLinkManager] 短链列表加密请求处理完成");
  } catch (error) {
    console.error("❌ [ShortLinkManager] 获取短链列表失败:", error);
    res.status(500).json({ error: "获取短链列表失败" });
  }
});

router.delete("/shortlinks/:id", authenticateToken, async (req, res) => {
  try {
    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const { id } = req.params;

    // 验证ID格式，防止NoSQL注入
    if (!id || typeof id !== "string" || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ error: "无效的短链ID格式" });
    }

    const ShortUrlModel = require("mongoose").models.ShortUrl || require("mongoose").model("ShortUrl");
    const link = await ShortUrlModel.findById(id);

    if (!link) {
      return res.status(404).json({ error: "短链不存在" });
    }

    await ShortUrlModel.findByIdAndDelete(id);
    logger.info("[ShortLink] 管理员删除短链", {
      admin: req.user?.username || req.user?.id,
      code: link?.code,
      target: link?.target,
      id: id,
      time: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("[ShortLink] 删除短链失败:", error);
    res.status(500).json({ error: "删除短链失败" });
  }
});

// 批量删除短链
router.post("/shortlinks/batch-delete", authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;

    // 验证请求体
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: "请提供有效的短链ID列表" });
    }

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const ShortUrlModel = require("mongoose").models.ShortUrl || require("mongoose").model("ShortUrl");

    // 验证每个ID的格式，防止NoSQL注入
    const validIds = ids.filter((id) => typeof id === "string" && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id));

    if (validIds.length === 0) {
      return res.status(400).json({ error: "没有有效的短链ID" });
    }

    // 限制批量删除的数量，防止DoS攻击
    if (validIds.length > 100) {
      return res.status(400).json({ error: "批量删除数量不能超过100个" });
    }

    // 查找所有要删除的短链
    const links = await ShortUrlModel.find({ _id: { $in: validIds } });

    if (links.length === 0) {
      return res.status(404).json({ error: "没有找到要删除的短链" });
    }

    // 执行批量删除
    const deleteResult = await ShortUrlModel.deleteMany({ _id: { $in: validIds } });

    logger.info("[ShortLink] 管理员批量删除短链", {
      admin: req.user?.username || req.user?.id,
      requestedCount: ids.length,
      validCount: validIds.length,
      deletedCount: deleteResult.deletedCount,
      deletedCodes: links.map((link: any) => link.code),
      time: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "批量删除成功",
      data: {
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: links.map((link: any) => link.code),
      },
    });
  } catch (error) {
    logger.error("[ShortLink] 批量删除短链失败:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "批量删除短链失败",
    });
  }
});

// 创建短链
router.post(
  "/shortlinks",
  authenticateToken,
  replayProtection(),
  auditLog({
    module: "shorturl",
    action: "shorturl.create",
    extractDetail: (req) => ({ target: req.body.target, customCode: req.body.customCode }),
  }),
  async (req, res) => {
    try {
      // 检查管理员权限
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "需要管理员权限" });
      }

      const { target, customCode } = req.body;

      // 输入验证
      if (!target || typeof target !== "string") {
        return res.status(400).json({ error: "目标地址不能为空" });
      }

      // 验证目标URL格式
      const trimmedTarget = target.trim();
      if (trimmedTarget.length === 0 || trimmedTarget.length > 2000) {
        return res.status(400).json({ error: "目标地址长度必须在1-2000个字符之间" });
      }

      // 验证URL格式
      try {
        new URL(trimmedTarget);
      } catch {
        return res.status(400).json({ error: "目标地址必须是有效的URL格式" });
      }

      const mongoose = require("mongoose");
      const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model("ShortUrl");
      const nanoid = require("nanoid").nanoid;
      const { shortUrlMigrationService } = require("../services/shortUrlMigrationService");

      let code: string;

      // 如果提供了自定义短链接码
      if (customCode && typeof customCode === "string") {
        const trimmedCode = customCode.trim();

        // 验证自定义短链接码格式
        if (trimmedCode.length < 1 || trimmedCode.length > 200) {
          return res.status(400).json({ error: "自定义短链接码长度必须在1-200个字符之间" });
        }

        // 验证字符格式（只允许字母、数字、连字符和下划线）
        if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
          return res.status(400).json({ error: "自定义短链接码只能包含字母、数字、连字符和下划线" });
        }

        // 检查是否已存在
        const existingShortUrl = await ShortUrlModel.findOne({ code: trimmedCode });
        if (existingShortUrl) {
          return res.status(400).json({ error: "该短链接码已被使用，请选择其他短链接码" });
        }

        code = trimmedCode;
      } else {
        // 生成随机短链接码
        let randomCode = nanoid(6);
        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
          const existingCode = await ShortUrlModel.findOne({ code: randomCode });
          if (!existingCode) {
            break;
          }
          randomCode = nanoid(6);
          retries++;
        }

        if (retries >= maxRetries) {
          return res.status(500).json({ error: "无法生成唯一的短链代码，请重试" });
        }

        code = randomCode;
      }

      // 使用迁移服务自动修正目标URL
      const fixedTarget = shortUrlMigrationService.fixTargetUrlBeforeSave(trimmedTarget);

      const userId = req.user?.id || "admin";
      const username = req.user?.username || "admin";
      const doc = await ShortUrlModel.create({ code, target: fixedTarget, userId, username });
      res.json({ success: true, code, shortUrl: `/s/${code}`, doc });
    } catch (error) {
      logger.error("[ShortLink] 创建短链失败:", error);
      res.status(500).json({ error: "创建短链失败" });
    }
  },
);

// 短链迁移管理API
router.post("/shortlinks/migrate", authenticateToken, async (req, res) => {
  try {
    console.log("🔐 [ShortUrlMigration] 开始处理短链迁移请求...");
    console.log("   用户ID:", req.user?.id);
    console.log("   用户名:", req.user?.username);
    console.log("   用户角色:", req.user?.role);
    console.log("   请求IP:", req.ip);

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      console.log("❌ [ShortUrlMigration] 权限检查失败：非管理员用户");
      return res.status(403).json({ error: "需要管理员权限" });
    }

    console.log("✅ [ShortUrlMigration] 权限检查通过");

    const { shortUrlMigrationService } = require("../services/shortUrlMigrationService");

    // 执行迁移
    const result = await shortUrlMigrationService.detectAndFixOldDomainUrls();

    console.log("📊 [ShortUrlMigration] 迁移完成");
    console.log("   检查记录数:", result.totalChecked);
    console.log("   修正记录数:", result.totalFixed);

    res.json({
      success: true,
      message: `迁移完成，共修正 ${result.totalFixed} 条记录`,
      data: result,
    });
  } catch (error) {
    console.error("❌ [ShortUrlMigration] 短链迁移失败:", error);
    res.status(500).json({ error: "短链迁移失败" });
  }
});

// 获取短链迁移统计信息
router.get("/shortlinks/migration-stats", authenticateToken, async (req, res) => {
  try {
    console.log("🔐 [ShortUrlMigration] 开始处理迁移统计请求...");
    console.log("   用户ID:", req.user?.id);
    console.log("   用户名:", req.user?.username);
    console.log("   用户角色:", req.user?.role);

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      console.log("❌ [ShortUrlMigration] 权限检查失败：非管理员用户");
      return res.status(403).json({ error: "需要管理员权限" });
    }

    console.log("✅ [ShortUrlMigration] 权限检查通过");

    const { shortUrlMigrationService } = require("../services/shortUrlMigrationService");

    // 获取统计信息
    const stats = await shortUrlMigrationService.getMigrationStats();

    console.log("📊 [ShortUrlMigration] 统计信息获取完成");
    console.log("   总记录数:", stats.totalRecords);
    console.log("   旧域名记录数:", stats.oldDomainRecords);
    console.log("   新域名记录数:", stats.newDomainRecords);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ [ShortUrlMigration] 获取迁移统计失败:", error);
    res.status(500).json({ error: "获取迁移统计失败" });
  }
});

// 管理员权限验证API
router.post("/verify-access", authenticateToken, async (req, res) => {
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
    if (req.user.role !== "admin") {
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
    const { UserStorage } = require("../utils/userStorage");
    const dbUser = await UserStorage.getUserById(id);
    if (dbUser) {
      email = dbUser.email;
      if (dbUser.avatarUrl && typeof dbUser.avatarUrl === "string" && dbUser.avatarUrl.length > 0) {
        // 将 ipfs.crossbell.io 替换为 ipfs.951100.xyz
        avatarUrl = dbUser.avatarUrl.replace("ipfs.crossbell.io", "ipfs.951100.xyz");
        // 尝试从URL中提取hash（如文件名带hash），否则可用md5等生成
        const match = avatarUrl.match(/([a-fA-F0-9]{8,})\.(jpg|jpeg|png|webp|gif)$/);
        if (match) {
          avatarHash = match[1];
        } else {
          // 若URL不带hash，可用URL整体md5
          const crypto = require("node:crypto");
          avatarHash = crypto.createHash("md5").update(avatarUrl).digest("hex");
        }
      }
    }
    const resp = { id, username, email, role };
    if (avatarUrl) {
      (resp as any).avatarUrl = avatarUrl;
      (resp as any).avatarHash = avatarHash;
    }
    res.json(resp);
  } catch (_e) {
    res.status(500).json({ error: "获取用户信息失败" });
  }
});

// 用户信息更新接口（需登录）
router.post("/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });
    const { email, password, newPassword, avatarUrl, verificationCode } = req.body;
    const { UserStorage } = require("../utils/userStorage");
    const dbUser = await UserStorage.getUserById(user.id);
    // 判断二次认证方式
    const hasTOTP = !!dbUser.totpEnabled;
    const hasPasskey = Array.isArray(dbUser.passkeyCredentials) && dbUser.passkeyCredentials.length > 0;
    if (!hasTOTP && !hasPasskey) {
      if (!password || !UserStorage.checkPassword(dbUser, password)) {
        if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") {
          console.warn("[UserStorage] 密码校验失败，预期密码:", dbUser.password);
        }
        return res.status(401).json({ error: "密码错误，无法验证身份" });
      }
    } else {
      if (!verificationCode && !(avatarUrl && !email && !newPassword)) {
        return res.status(401).json({ error: "请提供TOTP或Passkey验证码" });
      }
      // 这里可调用原有TOTP/Passkey校验逻辑（略，假设通过）
    }
    // 更新信息
    const updateData: any = {};
    if (email) updateData.email = email;
    if (avatarUrl && typeof avatarUrl === "string") {
      updateData.avatarUrl = avatarUrl;
    }
    if (newPassword) updateData.password = newPassword;
    // 只有明确需要重置passkeyCredentials时才设置，避免误清空
    // if (!Array.isArray(dbUser.passkeyCredentials)) {
    //   updateData.passkeyCredentials = [];
    // }
    await UserStorage.updateUser(user.id, updateData);
    const updated = await UserStorage.getUserById(user.id);
    const { password: _, ...safeUser } = updated;
    const resp = { ...safeUser };
    res.json(resp);
  } catch (e) {
    console.error("用户信息更新接口异常:", e);
    res.status(500).json({ error: "信息修改失败" });
  }
});

// 用户头像上传接口（支持文件上传到IPFS）
router.post("/user/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });
    if (!req.file) return res.status(400).json({ error: "未上传头像文件" });

    // 验证文件类型和大小
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/svg+xml",
    ];
    if (!allowedTypes.includes(req.file.mimetype.toLowerCase())) {
      return res.status(400).json({ error: "不支持的文件格式，请上传图片文件（JPEG、PNG、GIF、WebP、BMP、SVG）" });
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      return res.status(400).json({ error: "文件大小不能超过5MB" });
    }

    // 直接调用ipfsService上传图片
    const { IPFSService } = require("../services/ipfsService");
    let result;
    try {
      console.log(`[avatar upload] 开始上传头像: ${req.file.originalname}, 大小: ${req.file.size} bytes`);
      const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
        (req.headers["x-real-ip"] as string) ||
        req.ip ||
        (req.connection as any).remoteAddress ||
        (req.socket as any).remoteAddress ||
        "unknown";
      result = await IPFSService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        undefined,
        undefined,
        { clientIp, isAdmin: (req as any).user?.role === "admin" },
      );
      if (!result || !result.web2url) {
        console.error("[avatar upload] IPFS上传失败，返回值:", result);
        return res.status(500).json({ error: "IPFS上传失败，请稍后重试" });
      }
      console.log(`[avatar upload] IPFS上传成功: ${result.web2url}`);
    } catch (ipfsErr) {
      // 兼容 TS 类型，安全打印错误堆栈
      console.error(
        "[avatar upload] IPFS上传异常:",
        ipfsErr && typeof ipfsErr === "object" && "stack" in ipfsErr ? ipfsErr.stack : ipfsErr,
      );

      // 根据错误类型提供不同的错误信息
      let errorMessage = "头像上传失败，请稍后重试";
      if (ipfsErr instanceof Error) {
        if (ipfsErr.message.includes("503") || ipfsErr.message.includes("服务暂时不可用")) {
          errorMessage = "图床服务暂时不可用，请稍后重试";
        } else if (ipfsErr.message.includes("timeout") || ipfsErr.message.includes("超时")) {
          errorMessage = "上传超时，请检查网络连接后重试";
        } else if (ipfsErr.message.includes("网络") || ipfsErr.message.includes("network")) {
          errorMessage = "网络连接异常，请检查网络后重试";
        }
      }

      return res.status(500).json({
        error: errorMessage,
        detail: ipfsErr instanceof Error ? ipfsErr.message : String(ipfsErr),
        retryable: true,
      });
    }

    // 存储图片web2url，删除base64
    const { UserStorage } = require("../utils/userStorage");
    await UserStorage.updateUser(user.id, { avatarUrl: result.web2url, avatarBase64: undefined });
    res.json({ success: true, avatarUrl: result.web2url });
  } catch (e) {
    console.error("[avatar upload] 头像上传接口异常:", String(e));
    res.status(500).json({
      error: "头像上传失败，请稍后重试",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

// 用户头像是否存在接口（需登录）
// 逻辑：如果数据库中 avatarUrl 字段不存在或为空，返回 hasAvatar: false，前端可回退到默认 SVG
router.get("/user/avatar/exist", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });
    const { UserStorage } = require("../utils/userStorage");
    const dbUser = await UserStorage.getUserById(user.id);
    // avatarUrl 不存在或为空字符串时，hasAvatar 为 false
    const hasAvatar = !!(dbUser && typeof dbUser.avatarUrl === "string" && dbUser.avatarUrl.length > 0);
    res.json({ hasAvatar });
  } catch (_e) {
    res.status(500).json({ error: "查询头像状态失败" });
  }
});

// 用户指纹信息接口（需登录）
// 注意：此接口已废弃，请使用 /api/turnstile/fingerprint/report 接口
// 保留此接口仅用于向后兼容，新功能请使用 turnstile 路由中的接口
router.post("/user/fingerprint", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const { id } = req.body || {};
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "缺少指纹id" });
    }

    const ua = req.headers["user-agent"] || "";
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || "";
    const ts = Date.now();

    const fingerprintRecord = { id, ts, ua: String(ua), ip: String(ip) };

    const { updateUser, getUserById } = require("../services/userService");
    const current = await getUserById(user.id);
    const existing = (current && (current as any).fingerprints) || [];
    // 保留最新的20条指纹记录
    const next = [fingerprintRecord, ...existing].slice(0, 20);

    // 保存指纹并清除一次性上报需求标记及时间戳
    await updateUser(user.id, { fingerprints: next, requireFingerprint: false, requireFingerprintAt: 0 } as any);

    // 通过 WebSocket 推送指纹已上报确认
    try {
      const { wsService } = require("../services/wsService");
      wsService.notifyFingerprintAck(user.id);
    } catch (_wsErr) {
      // WS 推送失败不影响主流程
    }

    res.json({ success: true });
  } catch (e) {
    console.error("保存指纹失败", e);
    res.status(500).json({ error: "保存指纹失败" });
  }
});

// 管理员查询指定用户的指纹预约状态（需管理员权限）
router.get("/users/:id/fingerprint/require/status", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });
    const { getUserById } = require("../services/userService");
    const target = await getUserById(userId);
    if (!target) return res.status(404).json({ error: "用户不存在" });
    const requireFingerprint = !!(target as any).requireFingerprint;
    const requireFingerprintAt = Number((target as any).requireFingerprintAt || 0);
    return res.json({ success: true, requireFingerprint, requireFingerprintAt });
  } catch (e) {
    console.error("查询指纹预约状态失败", e);
    return res.status(500).json({ error: "查询失败" });
  }
});

// 查询用户指纹状态（需登录）：返回最近一次指纹时间与总数量及IP变更情况
router.get("/user/fingerprint/status", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const { getUserById } = require("../services/userService");
    const current = await getUserById(user.id);
    const fps = (current && (current as any).fingerprints) || [];
    const count = Array.isArray(fps) ? fps.length : 0;
    const lastTs = count > 0 && fps[0] && typeof fps[0].ts === "number" ? fps[0].ts : 0;
    const lastIp = count > 0 && fps[0] && typeof fps[0].ip === "string" ? fps[0].ip : "";
    const currentIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || "";
    const ipChanged = !!(lastIp && currentIp && lastIp !== currentIp);

    const lastUa = count > 0 && fps[0] && typeof fps[0].ua === "string" ? fps[0].ua : "";
    const currentUa = String(req.headers["user-agent"] || "");
    const uaChanged = !!(lastUa && currentUa && lastUa !== currentUa);

    // 获取指纹请求状态字段
    const requireFingerprint = (current && (current as any).requireFingerprint) || false;
    const requireFingerprintAt = (current && (current as any).requireFingerprintAt) || 0;
    const fingerprintRequestDismissedOnce = (current && (current as any).fingerprintRequestDismissedOnce) || false;
    const fingerprintRequestDismissedAt = (current && (current as any).fingerprintRequestDismissedAt) || 0;

    res.json({
      success: true,
      count,
      lastTs,
      lastIp,
      ipChanged,
      uaChanged,
      requireFingerprint,
      requireFingerprintAt,
      fingerprintRequestDismissedOnce,
      fingerprintRequestDismissedAt,
    });
  } catch (e) {
    console.error("查询指纹状态失败", e);
    res.status(500).json({ error: "查询指纹状态失败" });
  }
});

// 记录用户关闭指纹请求（需登录，一生只能关闭一次）
router.post("/user/fingerprint/dismiss", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const { getUserById, updateUser } = require("../services/userService");
    const current = await getUserById(user.id);
    if (!current) return res.status(404).json({ error: "用户不存在" });

    // 检查是否已经关闭过一次
    const alreadyDismissed = (current as any).fingerprintRequestDismissedOnce || false;
    if (alreadyDismissed) {
      return res.status(400).json({
        error: "您已经关闭过一次指纹请求，无法再次关闭",
        fingerprintRequestDismissedOnce: true,
      });
    }

    // 记录关闭
    await updateUser(user.id, {
      fingerprintRequestDismissedOnce: true,
      fingerprintRequestDismissedAt: Date.now(),
    });

    console.log(`✅ 用户 ${user.id} 关闭了指纹请求（一生只能关闭一次）`);

    res.json({
      success: true,
      message: "已记录您的关闭操作，下次将无法再关闭",
      fingerprintRequestDismissedOnce: true,
      fingerprintRequestDismissedAt: Date.now(),
    });
  } catch (e) {
    console.error("记录指纹请求关闭失败", e);
    res.status(500).json({ error: "记录失败" });
  }
});

// 管理员删除指定用户的一条指纹记录（需管理员权限）
router.delete("/users/:id/fingerprints/:fpId", async (req, res) => {
  try {
    // adminAuthMiddleware 已在上方全局应用，此处为管理员接口
    const userId = req.params.id;
    const fpId = req.params.fpId;
    if (!userId || !fpId) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

    const { getUserById, updateUser } = require("../services/userService");
    const target = await getUserById(userId);
    if (!target) return res.status(404).json({ error: "用户不存在" });

    const list: any[] = (target as any).fingerprints || [];
    const tsParam = Number(req.query.ts || 0);

    let next: any[] = [...list];
    if (tsParam && !Number.isNaN(tsParam)) {
      // 精确按 id+ts 删除单条
      next = list.filter((r: any) => !(r && r.id === fpId && Number(r.ts) === tsParam));
    } else {
      // 未传 ts 时，仅删除首个匹配该 id 的记录
      const idx = list.findIndex((r: any) => r && r.id === fpId);
      if (idx >= 0) {
        next.splice(idx, 1);
      }
    }

    await updateUser(userId, { fingerprints: next } as any);
    return res.json({ success: true, fingerprints: next });
  } catch (e) {
    console.error("删除指纹失败", e);
    return res.status(500).json({ error: "删除指纹失败" });
  }
});

// WebSocket 广播接口（管理员向所有在线用户推送消息）
router.post("/broadcast", async (req, res) => {
  try {
    const { message, level, duration, display, format, title } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "缺少 message 参数" });
    }
    const safeDuration = typeof duration === "number" && duration > 0 ? Math.min(duration, 60000) : undefined;
    const safeDisplay = display === "modal" ? "modal" : "toast";
    const safeFormat = ["text", "html", "markdown"].includes(format) ? format : "text";
    const safeTitle = typeof title === "string" ? title.slice(0, 200) : undefined;
    const { wsService } = require("../services/wsService");
    wsService.notifyAll(message, level || "info", {
      duration: safeDuration,
      display: safeDisplay,
      format: safeFormat,
      title: safeTitle,
    });

    // 存储广播历史
    try {
      const { mongoose } = require("../services/mongoService");
      const BroadcastLog =
        mongoose.models.BroadcastLog ||
        mongoose.model(
          "BroadcastLog",
          new mongoose.Schema({
            message: String,
            level: String,
            admin: String,
            connections: Number,
            createdAt: { type: Date, default: Date.now },
          }),
        );
      await BroadcastLog.create({
        message,
        level: level || "info",
        admin: (req as any).user?.username || "unknown",
        connections: wsService.getConnectionCount(),
      });
    } catch (dbErr) {
      logger.warn("[Admin] 广播历史存储失败（不影响广播）", dbErr);
    }

    logger.info("[Admin] WebSocket 广播消息", { message, level, admin: (req as any).user?.username });
    return res.json({ success: true, connections: wsService.getConnectionCount() });
  } catch (e) {
    logger.error("[Admin] 广播消息失败", e);
    return res.status(500).json({ error: "广播失败" });
  }
});

// 定向用户推送
router.post("/broadcast/user", async (req, res) => {
  try {
    const { userId, message, level, duration, display, format, title } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: "缺少 userId 或 message 参数" });
    }
    const safeDuration = typeof duration === "number" && duration > 0 ? Math.min(duration, 60000) : undefined;
    const safeDisplay = display === "modal" ? "modal" : "toast";
    const safeFormat = ["text", "html", "markdown"].includes(format) ? format : "text";
    const safeTitle = typeof title === "string" ? title.slice(0, 200) : undefined;
    const { wsService } = require("../services/wsService");
    wsService.sendToUser(userId, {
      type: "notification",
      data: { message, level: level || "info", duration: safeDuration, display: safeDisplay, format: safeFormat, title: safeTitle },
    });
    logger.info("[Admin] 定向推送", { userId, message, admin: (req as any).user?.username });
    return res.json({ success: true });
  } catch (e) {
    logger.error("[Admin] 定向推送失败", e);
    return res.status(500).json({ error: "推送失败" });
  }
});

// 广播历史记录
router.get("/broadcast/history", async (req, res) => {
  try {
    const { mongoose } = require("../services/mongoService");
    const BroadcastLog =
      mongoose.models.BroadcastLog ||
      mongoose.model(
        "BroadcastLog",
        new mongoose.Schema({
          message: String,
          level: String,
          admin: String,
          connections: Number,
          createdAt: { type: Date, default: Date.now },
        }),
      );
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const logs = await BroadcastLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, logs });
  } catch (e) {
    logger.error("[Admin] 获取广播历史失败", e);
    return res.status(500).json({ error: "获取历史失败" });
  }
});

// 在线用户列表
router.get("/ws/clients", async (_req, res) => {
  try {
    const { wsService } = require("../services/wsService");
    const clients = wsService.getOnlineClients();
    return res.json({
      success: true,
      total: wsService.getConnectionCount(),
      clients,
    });
  } catch (e) {
    logger.error("[Admin] 获取在线用户失败", e);
    return res.status(500).json({ error: "获取在线用户失败" });
  }
});

// 强制断开用户连接
router.post("/ws/kick", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "缺少 userId 参数" });
    }
    const { wsService } = require("../services/wsService");
    const kicked = wsService.kickUser(userId);
    logger.info("[Admin] 强制断开用户", { userId, kicked, admin: (req as any).user?.username });
    return res.json({ success: true, kicked });
  } catch (e) {
    logger.error("[Admin] 强制断开失败", e);
    return res.status(500).json({ error: "操作失败" });
  }
});

export default router;
