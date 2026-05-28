import * as crypto from "node:crypto";
import express from "express";
import { auditLog } from "../../middleware/auditLog";
import { authenticateToken } from "../../middleware/authenticateToken";
import { replayProtection } from "../../middleware/replayProtection";
import logger from "../../utils/logger";

const router = express.Router();

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
    if (!authHeader?.startsWith("Bearer ")) {
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
      const { shortUrlMigrationService } = require("../../services/shortUrlMigrationService");

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

    const { shortUrlMigrationService } = require("../../services/shortUrlMigrationService");

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

    const { shortUrlMigrationService } = require("../../services/shortUrlMigrationService");

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

export default router;
