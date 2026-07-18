import { Router } from "express";
import { ShortUrlController } from "../controllers/shortUrlController";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { adminAuthMiddleware, authMiddleware } from "../middleware/authMiddleware";
import { createLimiter } from "../middleware/routeLimiters";
import { replayProtection } from "../middleware/replayProtection";
import { mongoose } from "../services/mongoService";
import { ShortUrlService } from "../services/shortUrlService";
import { config } from "../config/config";

const router = Router();
const redirectRouter = Router();
const shortUrlApiKeyAuth = apiKeyAuth("shorturl");

// 速率限制器（统一 routeLimiters）
const redirectLimiter = createLimiter({
  name: "shorturlRedirect",
  profile: "burst",
  category: "public-api",
  max: 120,
  message: "访问过于频繁，请稍后再试",
});

const userManageLimiter = createLimiter({
  name: "shorturlUserManage",
  profile: "standard",
  category: "public-api",
  message: "操作过于频繁，请稍后再试",
});

const adminLimiter = createLimiter({
  name: "shorturlAdmin",
  profile: "admin",
  category: "admin",
  windowMs: 5 * 60 * 1000,
  max: 50,
  message: "管理员操作过于频繁，请稍后再试",
});

const adminSensitiveLimiter = createLimiter({
  name: "shorturlAdminSensitive",
  profile: "sensitive",
  category: "admin",
  message: "操作过于频繁，请稍后再试",
});

const adminWriteLimiter = createLimiter({
  name: "shorturlAdminWrite",
  profile: "sensitive",
  category: "admin",
  max: 5,
  message: "写入过于频繁，请稍后再试",
});

const publicCreateLimiter = createLimiter({
  name: "shorturlPublicCreate",
  profile: "login",
  category: "public-api",
  max: 5,
  message: "公共短链创建请求过于频繁，请稍后再试",
});

// 防重放保护实例
const replayGuard = replayProtection();

// 用户短链管理（需要登录）
router.get("/shorturls", shortUrlApiKeyAuth, authMiddleware, userManageLimiter, ShortUrlController.getUserShortUrls);
router.delete("/shorturls/:code", shortUrlApiKeyAuth, authMiddleware, userManageLimiter, ShortUrlController.deleteShortUrl);
router.delete("/shorturls/batch", shortUrlApiKeyAuth, authMiddleware, userManageLimiter, ShortUrlController.batchDeleteShortUrls);

// 管理员功能：导出所有短链数据
router.get("/admin/export", authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.exportAllShortUrls);

// 管理员功能：删除所有短链数据
router.delete(
  "/admin/deleteall",
  authMiddleware,
  adminAuthMiddleware,
  adminLimiter,
  replayGuard,
  ShortUrlController.deleteAllShortUrls,
);

// 管理员功能：导入短链数据
router.post(
  "/admin/import",
  authMiddleware,
  adminAuthMiddleware,
  adminLimiter,
  replayGuard,
  ShortUrlController.importShortUrls,
);

// ========== 管理员功能：配置短链 AES_KEY（数据库优先，支持导入/导出加解密）===========
const ShortUrlSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "AES_KEY" },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "shorturl_settings" },
);
const ShortUrlSettingModel =
  mongoose.models.ShortUrlSetting || mongoose.model("ShortUrlSetting", ShortUrlSettingSchema);

// 获取 AES_KEY（脱敏显示）
router.get(
  "/admin/aes-key",
  authMiddleware,
  adminAuthMiddleware,
  adminSensitiveLimiter,
  adminLimiter,
  async (_req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.json({ success: true, aesKey: null });
      }
      const doc: any = await ShortUrlSettingModel.findOne({ key: "AES_KEY" }).lean();
      if (!doc?.value) return res.json({ success: true, aesKey: null });
      const masked = doc.value.length > 8 ? `${doc.value.slice(0, 2)}***${doc.value.slice(-4)}` : "***";
      return res.json({ success: true, aesKey: masked, updatedAt: doc.updatedAt });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取 AES_KEY 失败" });
    }
  },
);

// 设置/更新 AES_KEY
router.post(
  "/admin/aes-key",
  authMiddleware,
  adminAuthMiddleware,
  adminSensitiveLimiter,
  adminWriteLimiter,
  adminLimiter,
  replayGuard,
  async (req, res) => {
    try {
      const { value } = req.body || {};
      if (typeof value !== "string" || !value.trim() || value.length > 512) {
        return res.status(400).json({ success: false, error: "无效的 AES_KEY" });
      }
      const now = new Date();
      await ShortUrlSettingModel.findOneAndUpdate(
        { key: "AES_KEY" },
        { value: value.trim(), updatedAt: now },
        { upsert: true },
      );
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存 AES_KEY 失败" });
    }
  },
);

// 删除 AES_KEY（恢复为仅环境变量或无加密）
router.delete(
  "/admin/aes-key",
  authMiddleware,
  adminAuthMiddleware,
  adminSensitiveLimiter,
  adminWriteLimiter,
  adminLimiter,
  replayGuard,
  async (_req, res) => {
    try {
      await ShortUrlSettingModel.deleteOne({ key: "AES_KEY" });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除 AES_KEY 失败" });
    }
  },
);

// 匿名公共创建短链（显式启用、独立口令、严格限流）
router.post("/public/create", publicCreateLimiter, async (req: any, res: any) => {
  try {
    const { target, customCode, password } = req.body || {};

    if (!config.publicShortUrl.enabled) {
      return res.status(404).json({ error: "公共短链创建未启用" });
    }

    const publicShortUrlPassword = config.publicShortUrl.password;
    if (!publicShortUrlPassword) {
      return res.status(503).json({ error: "公共短链创建服务未正确配置" });
    }

    if (!password || password !== publicShortUrlPassword) {
      return res.status(403).json({ error: "密码错误" });
    }

    // 输入验证
    if (!target || typeof target !== "string") {
      return res.status(400).json({ error: "目标地址不能为空" });
    }

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

    let code: string;

    if (customCode && typeof customCode === "string") {
      const trimmedCode = customCode.trim();
      if (trimmedCode.length < 1 || trimmedCode.length > 200) {
        return res.status(400).json({ error: "自定义短链接码长度必须在1-200个字符之间" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        return res.status(400).json({ error: "自定义短链接码只能包含字母、数字、连字符和下划线" });
      }
      const ShortUrlModelRef = mongoose.models.ShortUrl || mongoose.model("ShortUrl");
      const existing = await ShortUrlModelRef.findOne({ code: trimmedCode });
      if (existing) {
        return res.status(400).json({ error: "该短链接码已被使用" });
      }
      code = trimmedCode;
    } else {
      // 使用 ShortUrlService 创建（含事务和去重策略）
      const shortUrl = await ShortUrlService.createShortUrl(trimmedTarget, "public", "anonymous");
      return res.json({ success: true, shortUrl });
    }

    // 自定义码直接创建
    const { shortUrlMigrationService } = require("../services/shortUrlMigrationService");
    const fixedTarget = shortUrlMigrationService.fixTargetUrlBeforeSave(trimmedTarget);
    const ShortUrlModelRef = mongoose.models.ShortUrl || mongoose.model("ShortUrl");
    await ShortUrlModelRef.create({ code, target: fixedTarget, userId: "public", username: "anonymous" });
    const baseUrl = process.env.VITE_API_URL || process.env.BASE_URL || "https://tts.chloemlla.com";
    return res.json({ success: true, shortUrl: `${baseUrl}/s/${code}` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "创建失败" });
  }
});

// 短链重定向（公开访问）— 放到最后，避免覆盖 /admin 与 /shorturls 前缀
const reservedShortUrlCodes = new Set(["admin", "shorturls", "public"]);

redirectRouter.get(
  "/:code",
  (req, _res, next) => {
    if (reservedShortUrlCodes.has(String(req.params.code || "").toLowerCase())) {
      return next("route");
    }
    return next();
  },
  redirectLimiter,
  ShortUrlController.redirectToTarget,
);

router.get("/:code", redirectLimiter, ShortUrlController.redirectToTarget);

export const shortUrlRedirectRoutes = redirectRouter;
export default router;
