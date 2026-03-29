import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import mysql from "mysql2/promise";
import * as envModule from "../config/env";
import { mongoose } from "../services/mongoService";
import { sendEmail } from "../services/emailSender";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";

const STORAGE_MODE = process.env.STORAGE_MODE || "mongo";
const ANNOUNCEMENT_FILE = path.join(__dirname, "../../data/announcement.json");
const ENV_FILE = path.join(__dirname, "../../data/env.admin.json");

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ENV_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function writeEnvFile(envs: any[]) {
  fs.writeFileSync(ENV_FILE, JSON.stringify(envs, null, 2));
}

// MongoDB 公告 Schema
const AnnouncementSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    format: { type: String, enum: ["markdown", "html"], default: "markdown" },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "announcements" },
);

// 自动初始化公告集合（仅 mongo）
async function ensureMongoAnnouncementCollection() {
  if (mongoose.connection.readyState === 1) {
    const db = (mongoose.connection.db ?? undefined) as typeof mongoose.connection.db | undefined;
    if (!db) return;
    const collections = await db.listCollections().toArray();
    if (!collections.find((c) => c.name === "announcements")) {
      await db.createCollection("announcements");
    }
  }
}

const AnnouncementModel = mongoose.models.Announcement || mongoose.model("Announcement", AnnouncementSchema);

// ========== 新增：对外邮件设置集合（outemail_settings）===========
const OutEmailSettingSchema = new mongoose.Schema(
  {
    domain: { type: String, default: "" },
    code: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "outemail_settings" },
);
const OutEmailSettingModel =
  mongoose.models.OutEmailSetting || mongoose.model("OutEmailSetting", OutEmailSettingSchema);

// ========== 新增：MOD 列表修改码设置集合（modlist_settings）===========
const ModlistSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "MODIFY_CODE" },
    code: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "modlist_settings" },
);
const ModlistSettingModel = mongoose.models.ModlistSetting || mongoose.model("ModlistSetting", ModlistSettingSchema);

// ========== 新增：TTS 生成码设置集合（tts_settings）===========
const TtsSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "GENERATION_CODE" },
    code: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "tts_settings" },
);
const TtsSettingModel = mongoose.models.TtsSetting || mongoose.model("TtsSetting", TtsSettingSchema);

// ========== 新增：Webhook 密钥设置集合（webhook_settings）===========
const WebhookSecretSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "resend" },
    key: { type: String, default: "DEFAULT" },
    secret: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "webhook_settings" },
);
const WebhookSecretModel = mongoose.models.WebhookSecret || mongoose.model("WebhookSecret", WebhookSecretSchema);

// MySQL建表
async function ensureMysqlTable(conn: any) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content TEXT NOT NULL,
    format VARCHAR(16) DEFAULT 'markdown',
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

// XSS 过滤简单实现
function sanitizeInput(str: string) {
  return str.replace(/[<>]/g, "");
}

// 安全校验辅助：是否为合法的用户 ID 字符串（防 NoSQL/路径注入）
function isValidUserId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 128;
}

// 合法 role 枚举
const VALID_ROLES = new Set(["user", "admin"]);

// 合法 announcement format 枚举
const VALID_ANNOUNCEMENT_FORMATS = new Set(["markdown", "html"]);

/**
 * 对 updateUser / createUser 中允许写入的各字段做严格类型与范围校验。
 * 返回净化后的 updates 对象，遇到非法值则抛出带描述的 Error。
 * token 字段故意不在白名单内（禁止通过此接口直接写 token）。
 */
function validateAndSanitizeUserUpdates(body: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};

  // username: 3-20 位字母数字下划线
  if (body.username !== undefined) {
    if (typeof body.username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(body.username.trim())) {
      throw new Error("用户名格式不合法（3-20位字母数字下划线）");
    }
    out.username = body.username.trim();
  }

  // email
  if (body.email !== undefined) {
    if (typeof body.email !== "string" || body.email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())) {
      throw new Error("邮箱格式不合法");
    }
    out.email = body.email.trim().toLowerCase();
  }

  // role: 枚举限制
  if (body.role !== undefined) {
    if (!VALID_ROLES.has(body.role)) {
      throw new Error("role 值非法，只允许 user 或 admin");
    }
    out.role = body.role;
  }

  // dailyUsage: 非负整数
  if (body.dailyUsage !== undefined) {
    const v = Number(body.dailyUsage);
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000) {
      throw new Error("dailyUsage 必须为 0-1000000 的整数");
    }
    out.dailyUsage = v;
  }

  // lastUsageDate: ISO 日期字符串或空串
  if (body.lastUsageDate !== undefined) {
    if (typeof body.lastUsageDate !== "string" || body.lastUsageDate.length > 64) {
      throw new Error("lastUsageDate 格式不合法");
    }
    out.lastUsageDate = body.lastUsageDate.trim();
  }

  // tokenExpiresAt: 允许管理员置 0 使 token 立即失效，但不允许超远未来
  if (body.tokenExpiresAt !== undefined) {
    const v = Number(body.tokenExpiresAt);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error("tokenExpiresAt 必须为非负数");
    }
    const maxAllowed = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (v > maxAllowed) {
      throw new Error("tokenExpiresAt 不得超过当前时间 365 天");
    }
    out.tokenExpiresAt = v;
  }

  // totpEnabled: boolean
  if (body.totpEnabled !== undefined) {
    out.totpEnabled = Boolean(body.totpEnabled);
  }

  // totpSecret: 长度限制
  if (body.totpSecret !== undefined) {
    if (typeof body.totpSecret !== "string" || body.totpSecret.length > 256) {
      throw new Error("totpSecret 格式不合法");
    }
    out.totpSecret = body.totpSecret.trim();
  }

  // backupCodes: 字符串数组，最多 20 条，每条最长 128 字符
  if (body.backupCodes !== undefined) {
    if (!Array.isArray(body.backupCodes) || body.backupCodes.length > 20) {
      throw new Error("backupCodes 必须为不超过 20 个元素的数组");
    }
    for (const code of body.backupCodes) {
      if (typeof code !== "string" || code.length > 128) {
        throw new Error("backupCodes 中包含非法元素");
      }
    }
    out.backupCodes = body.backupCodes.map((c: string) => c.trim()).filter(Boolean);
  }

  // passkeyEnabled / passkeyVerified: boolean
  if (body.passkeyEnabled !== undefined) out.passkeyEnabled = Boolean(body.passkeyEnabled);
  if (body.passkeyVerified !== undefined) out.passkeyVerified = Boolean(body.passkeyVerified);

  // pendingChallenge / currentChallenge: 字符串，长度限制
  for (const field of ["pendingChallenge", "currentChallenge"]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > 512) {
        throw new Error(field + " 格式不合法");
      }
      out[field] = (body[field] as string).trim();
    }
  }

  // avatarUrl: 只允许 http/https 或空串
  if (body.avatarUrl !== undefined) {
    if (typeof body.avatarUrl !== "string" || body.avatarUrl.length > 2048) {
      throw new Error("avatarUrl 格式不合法");
    }
    const trimmed = body.avatarUrl.trim();
    if (trimmed !== "" && !/^https?:\/\//i.test(trimmed)) {
      throw new Error("avatarUrl 只允许 http/https 协议");
    }
    out.avatarUrl = trimmed;
  }

  // requireFingerprint / fingerprintRequestDismissedOnce: boolean
  if (body.requireFingerprint !== undefined) out.requireFingerprint = Boolean(body.requireFingerprint);
  if (body.fingerprintRequestDismissedOnce !== undefined)
    out.fingerprintRequestDismissedOnce = Boolean(body.fingerprintRequestDismissedOnce);

  // requireFingerprintAt / fingerprintRequestDismissedAt: 非负整数时间戳
  for (const field of ["requireFingerprintAt", "fingerprintRequestDismissedAt"]) {
    if (body[field] !== undefined) {
      const v = Number(body[field]);
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(field + " 必须为非负数");
      }
      out[field] = v;
    }
  }

  // ticketViolationCount: 非负整数
  if (body.ticketViolationCount !== undefined) {
    const v = Number(body.ticketViolationCount);
    if (!Number.isInteger(v) || v < 0) {
      throw new Error("ticketViolationCount 必须为非负整数");
    }
    out.ticketViolationCount = v;
  }

  // ticketBannedUntil: ISO 日期字符串或空串
  if (body.ticketBannedUntil !== undefined) {
    if (typeof body.ticketBannedUntil !== "string") {
      throw new Error("ticketBannedUntil 必须为字符串");
    }
    out.ticketBannedUntil = body.ticketBannedUntil.trim();
  }

  return out;
}

export const adminController = {
  getUsers: async (req: Request, res: Response) => {
    try {
      logger.info("🔐 [UserManagement] 开始处理用户列表加密请求...");
      logger.info("   用户ID:", req.user?.id);
      logger.info("   用户名:", req.user?.username);
      logger.info("   用户角色:", req.user?.role);
      logger.info("   请求IP:", req.ip);

      // 检查管理员权限
      if (!req.user || req.user.role !== "admin") {
        logger.info("❌ [UserManagement] 权限检查失败：非管理员用户");
        return res.status(403).json({ error: "需要管理员权限" });
      }

      logger.info("✅ [UserManagement] 权限检查通过");

      // 获取管理员token作为加密密钥
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        logger.info("❌ [UserManagement] Token格式错误：未携带Token或格式不正确");
        return res.status(401).json({ error: "未携带Token，请先登录" });
      }

      const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
      if (!token) {
        logger.info("❌ [UserManagement] Token为空");
        return res.status(401).json({ error: "Token为空" });
      }

      logger.info("✅ [UserManagement] Token获取成功，长度:", token.length);

      // 是否包含指纹信息（默认不返回）
      const includeFingerprints = ["1", "true", "yes"].includes(
        String((req.query as any).includeFingerprints || "").toLowerCase(),
      );
      if (!includeFingerprints) {
        logger.info("🛡️ [UserManagement] 将从响应中排除 fingerprints 字段");
      } else {
        logger.info("🔎 [UserManagement] 管理端请求包含 fingerprints 字段");
      }

      // 获取用户数据
      const users = await UserStorage.getAllUsers();
      const usersSanitized = users.map((user) => {
        const { password, ...rest } = user as any;
        if (!includeFingerprints) {
          const { fingerprints, ...restNoFp } = rest as any;
          return restNoFp;
        }
        return rest;
      });

      logger.info("📊 [UserManagement] 获取到用户数量:", usersSanitized.length);

      // 调试：检查第一个用户的指纹数据
      if (usersSanitized.length > 0 && usersSanitized[0]?.fingerprints?.length > 0) {
        const firstFingerprint = usersSanitized[0].fingerprints[0];
        logger.info("🔍 [UserManagement] 第一个指纹记录调试:", {
          hasId: !!firstFingerprint.id,
          hasTs: !!firstFingerprint.ts,
          hasUa: !!firstFingerprint.ua,
          hasIp: !!firstFingerprint.ip,
          hasDeviceInfo: !!firstFingerprint.deviceInfo,
          deviceInfoKeys: firstFingerprint.deviceInfo ? Object.keys(firstFingerprint.deviceInfo) : [],
          storageMode: process.env.USER_STORAGE_MODE || process.env.STORAGE_MODE || "unknown",
        });
      }

      // 准备加密数据
      const jsonData = JSON.stringify(usersSanitized);
      logger.info("📝 [UserManagement] JSON数据准备完成，长度:", jsonData.length);

      // 使用AES-256-CBC加密数据
      logger.info("🔐 [UserManagement] 开始AES-256-CBC加密...");
      const algorithm = "aes-256-cbc";

      // 生成密钥
      logger.info("   生成密钥...");
      const key = crypto.createHash("sha256").update(token).digest();
      logger.info("   密钥生成完成，长度:", key.length);

      // 生成IV
      logger.info("   生成初始化向量(IV)...");
      const iv = crypto.randomBytes(16);
      logger.info("   IV生成完成，长度:", iv.length);
      logger.info("   IV (hex):", iv.toString("hex"));

      // 创建加密器
      logger.info("   创建加密器...");
      const cipher = crypto.createCipheriv(algorithm, key, iv);

      // 执行加密
      logger.info("   开始加密数据...");
      let encrypted = cipher.update(jsonData, "utf8", "hex");
      encrypted += cipher.final("hex");

      logger.info("✅ [UserManagement] 加密完成");
      logger.info("   原始数据长度:", jsonData.length);
      logger.info("   加密后数据长度:", encrypted.length);
      logger.info("   加密算法:", algorithm);
      logger.info("   密钥长度:", key.length);
      logger.info("   IV长度:", iv.length);

      // 返回加密后的数据
      const response = {
        success: true,
        data: encrypted,
        iv: iv.toString("hex"),
      };

      logger.info("📤 [UserManagement] 准备返回加密数据");
      logger.info("   响应数据大小:", JSON.stringify(response).length);

      res.json(response);

      logger.info("✅ [UserManagement] 用户列表加密请求处理完成");
    } catch (error) {
      logger.error("❌ [UserManagement] 获取用户列表失败:", error);
      logger.error("获取用户列表失败:", error);
      res.status(500).json({ error: "获取用户列表失败" });
    }
  },

  createUser: async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: "参数不全" });
      }
      if (typeof password !== "string" || password.length < 8 || password.length > 256) {
        return res.status(400).json({ error: "密码长度须在 8-256 字符之间" });
      }

      // 校验并净化可选字段（username/email 由 createUser 内部再次校验）
      let extraUpdates: Record<string, any>;
      try {
        extraUpdates = validateAndSanitizeUserUpdates(req.body);
        // 这两个字段由 createUser 处理，避免重复覆写
        delete extraUpdates.username;
        delete extraUpdates.email;
      } catch (validationError: any) {
        return res.status(400).json({ error: validationError.message || "字段校验失败" });
      }

      const exist = await UserStorage.getUserByUsername(username);
      if (exist) {
        return res.status(400).json({ error: "用户名已存在" });
      }
      const user = await UserStorage.createUser(username, email, password);
      if (!user) return res.status(500).json({ error: "创建用户失败" });

      if (Object.keys(extraUpdates).length > 0) {
        await UserStorage.updateUser(user.id, extraUpdates as any);
      }

      const updated = await UserStorage.getUserById(user.id);
      const { password: _, ...newUser } = (updated || user) as any;
      res.status(201).json(newUser);
    } catch (error) {
      logger.error("创建用户失败:", error);
      res.status(500).json({ error: "创建用户失败" });
    }
  },

  updateUser: async (req: Request, res: Response) => {
    try {
      // 路径参数格式校验（防 NoSQL/路径注入）
      if (!isValidUserId(req.params.id)) {
        return res.status(400).json({ error: "非法的用户 ID" });
      }

      const user = await UserStorage.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      // 禁止管理员修改自身角色（防止意外降权/误操作锁死系统）
      if (req.user?.id === user.id && req.body.role !== undefined && req.body.role !== user.role) {
        return res.status(403).json({ error: "不允许修改自身角色" });
      }

      // 校验并净化字段（token 在函数内不会出现在白名单）
      let updates: Record<string, any>;
      try {
        updates = validateAndSanitizeUserUpdates(req.body);
      } catch (validationError: any) {
        return res.status(400).json({ error: validationError.message || "字段校验失败" });
      }

      // 密码单独处理：仅在传入非空字符串时才更新
      const newPassword = req.body.password;
      if (newPassword !== undefined) {
        if (typeof newPassword !== "string" || newPassword.trim().length < 8 || newPassword.trim().length > 256) {
          return res.status(400).json({ error: "密码长度须在 8-256 字符之间" });
        }
        updates.password = newPassword.trim();
      }

      // token 字段禁止通过此接口直接覆写（防 session 固定攻击）
      delete updates.token;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "没有提供任何可更新的字段" });
      }

      const updated = await UserStorage.updateUser(user.id, updates as any);
      const { password: _, ...updatedUser } = (updated || {}) as any;

      // 管理员修改用户信息后，发送通知邮件给用户
      // 需要通知的关键字段
      const NOTIFY_FIELDS = new Set([
        "username", "email", "role", "password",
        "dailyUsage", "totpEnabled", "passkeyEnabled", "avatarUrl",
      ]);

      // 检测实际变更的字段
      const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
      for (const [field, newVal] of Object.entries(updates)) {
        if (!NOTIFY_FIELDS.has(field)) continue;
        const oldVal = (user as any)[field];
        // 密码：只要提交了新密码就算变更（无法比对哈希值）
        if (field === "password") {
          changes.push({ field, oldValue: "******", newValue: "******（已重置）" });
          continue;
        }
        // 其他字段：值确实发生了变化才记录
        if (String(newVal ?? "") !== String(oldVal ?? "")) {
          changes.push({
            field,
            oldValue: String(oldVal ?? ""),
            newValue: String(newVal ?? ""),
          });
        }
      }

      // 有变更才发送邮件
      if (changes.length > 0 && user.email) {
        try {
          const { generateAdminUserUpdatedEmailHtml } = require("../templates/emailTemplates");
          const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const adminUsername = req.user?.username || "管理员";

          const emailHtml = generateAdminUserUpdatedEmailHtml(
            user.username,
            changeTime,
            adminUsername,
            changes,
            newPassword ? newPassword.trim() : undefined,
          );

          // 确定邮件主题
          const changedFieldNames = changes.map(c => {
            const labels: Record<string, string> = {
              username: "用户名", email: "邮箱", role: "角色", password: "密码",
              dailyUsage: "用量", totpEnabled: "两步验证", passkeyEnabled: "Passkey", avatarUrl: "头像",
            };
            return labels[c.field] || c.field;
          });
          const subject = `Synapse 账号${changedFieldNames.join("、")}被管理员修改通知`;

          // 发送到当前邮箱
          sendEmail({
            to: user.email,
            subject,
            html: emailHtml,
            logTag: "管理员修改用户信息通知",
            checkQuota: false,
          }).catch((e) => {
            logger.warn(`[管理员修改用户] 通知邮件发送失败: ${user.email}`, e);
          });

          // 如果邮箱本身被修改了，也通知旧邮箱
          const emailChange = changes.find(c => c.field === "email");
          if (emailChange && emailChange.oldValue && emailChange.oldValue !== emailChange.newValue) {
            sendEmail({
              to: emailChange.oldValue,
              subject: "Synapse 账号邮箱地址被管理员修改通知",
              html: emailHtml,
              logTag: "管理员修改邮箱通知(旧邮箱)",
              checkQuota: false,
            }).catch((e) => {
              logger.warn(`[管理员修改用户] 旧邮箱通知发送失败: ${emailChange.oldValue}`, e);
            });
          }

          logger.info(`[管理员修改用户] 已发送通知邮件至 ${user.email}，变更字段: ${changedFieldNames.join(", ")}，操作者: ${adminUsername}`);
        } catch (notifyError) {
          logger.warn("[管理员修改用户] 发送通知邮件失败:", notifyError);
        }
      }

      res.json(updatedUser);
    } catch (error) {
      logger.error("更新用户失败:", error);
      res.status(500).json({ error: "更新用户失败" });
    }
  },

  deleteUser: async (req: Request, res: Response) => {
    try {
      // 路径参数格式校验
      if (!isValidUserId(req.params.id)) {
        return res.status(400).json({ error: "非法的用户 ID" });
      }

      const user = await UserStorage.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      // 禁止管理员自我删除（防止锁死系统）
      if (req.user?.id === user.id) {
        return res.status(403).json({ error: "不允许删除自身账户" });
      }

      await UserStorage.deleteUser(user.id);
      const { password, ...deletedUser } = user;
      res.json(deletedUser);
    } catch (error) {
      logger.error("删除用户失败:", error);
      res.status(500).json({ error: "删除用户失败" });
    }
  },

  // 获取当前公告
  async getAnnouncement(_req: Request, res: Response) {
    try {
      if (STORAGE_MODE === "mongo" && mongoose.connection.readyState === 1) {
        await ensureMongoAnnouncementCollection();
        const ann = await AnnouncementModel.findOne().sort({ updatedAt: -1 }).lean();
        return res.json({ success: true, announcement: ann });
      } else if (STORAGE_MODE === "mysql" && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        const [rows] = await conn.execute("SELECT * FROM announcements ORDER BY updatedAt DESC LIMIT 1");
        await conn.end();
        return res.json({ success: true, announcement: (rows as any[])[0] });
      } else {
        if (fs.existsSync(ANNOUNCEMENT_FILE)) {
          const data = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, "utf-8"));
          return res.json({ success: true, announcement: data });
        }
        return res.json({ success: true, announcement: null });
      }
    } catch (_e) {
      res.status(500).json({ success: false, error: "获取公告失败" });
    }
  },

  // 设置/更新公告（仅管理员）
  async setAnnouncement(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      const { content, format } = req.body;
      if (typeof content !== "string" || !content.trim() || content.length > 2000)
        return res.status(400).json({ error: "公告内容不能为空且不超过2000字" });
      // format 枚举校验：只允许 markdown 或 html
      const safeFormat = VALID_ANNOUNCEMENT_FORMATS.has(format) ? format : "markdown";
      const safeContent = sanitizeInput(content);
      if (STORAGE_MODE === "mongo" && mongoose.connection.readyState === 1) {
        await ensureMongoAnnouncementCollection();
        const ann = await AnnouncementModel.create({
          content: safeContent,
          format: safeFormat,
          updatedAt: new Date(),
        });
        logger.info(`[公告] 管理员${req.user.username} 更新公告`);
        return res.json({ success: true, announcement: ann });
      } else if (STORAGE_MODE === "mysql" && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        await conn.execute("INSERT INTO announcements (content, format, updatedAt) VALUES (?, ?, NOW())", [
          safeContent,
          safeFormat,
        ]);
        const [rows] = await conn.execute("SELECT * FROM announcements ORDER BY updatedAt DESC LIMIT 1");
        await conn.end();
        logger.info(`[公告] 管理员${req.user.username} 更新公告`);
        return res.json({ success: true, announcement: (rows as any[])[0] });
      } else {
        const data = { content: safeContent, format: safeFormat, updatedAt: new Date().toISOString() };
        fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(data, null, 2));
        logger.info(`[公告] 管理员${req.user.username} 更新公告`);
        return res.json({ success: true, announcement: data });
      }
    } catch (_e) {
      res.status(500).json({ success: false, error: "设置公告失败" });
    }
  },

  // 删除所有公告（仅管理员）
  async deleteAnnouncements(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (STORAGE_MODE === "mongo" && mongoose.connection.readyState === 1) {
        await ensureMongoAnnouncementCollection();
        await AnnouncementModel.deleteMany({});
        return res.json({ success: true });
      } else if (STORAGE_MODE === "mysql" && process.env.MYSQL_URI) {
        const conn = await mysql.createConnection(process.env.MYSQL_URI);
        await ensureMysqlTable(conn);
        await conn.execute("DELETE FROM announcements");
        await conn.end();
        return res.json({ success: true });
      } else {
        if (fs.existsSync(ANNOUNCEMENT_FILE)) fs.unlinkSync(ANNOUNCEMENT_FILE);
        return res.json({ success: true });
      }
    } catch (_e) {
      res.status(500).json({ success: false, error: "删除公告失败" });
    }
  },

  // 获取所有环境变量
  async getEnvs(req: Request, res: Response) {
    try {
      logger.info("🔐 [EnvManager] 开始处理环境变量加密请求...");
      logger.info("   用户ID:", req.user?.id);
      logger.info("   用户名:", req.user?.username);
      logger.info("   用户角色:", req.user?.role);
      logger.info("   请求IP:", req.ip);

      // 检查管理员权限
      if (!req.user || req.user.role !== "admin") {
        logger.info("❌ [EnvManager] 权限检查失败：非管理员用户");
        return res.status(403).json({ error: "需要管理员权限" });
      }

      logger.info("✅ [EnvManager] 权限检查通过");

      // 获取管理员token作为加密密钥
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        logger.info("❌ [EnvManager] Token格式错误：未携带Token或格式不正确");
        return res.status(401).json({ error: "未携带Token，请先登录" });
      }

      const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
      if (!token) {
        logger.info("❌ [EnvManager] Token为空");
        return res.status(401).json({ error: "Token为空" });
      }

      logger.info("✅ [EnvManager] Token获取成功，长度:", token.length);

      // 收集所有环境变量
      let allEnvs: Record<string, any> = {};

      // 1. 读取本地.env文件
      logger.info("📁 [EnvManager] 开始读取本地.env文件...");
      const envFiles = [".env", ".env.local", ".env.development", ".env.production", ".env.test"];

      for (const envFile of envFiles) {
        const envPath = path.join(process.cwd(), envFile);
        if (fs.existsSync(envPath)) {
          try {
            const envContent = fs.readFileSync(envPath, "utf-8");
            const envLines = envContent.split("\n");
            for (const line of envLines) {
              const trimmedLine = line.trim();
              if (trimmedLine && !trimmedLine.startsWith("#") && trimmedLine.includes("=")) {
                const [key, ...valueParts] = trimmedLine.split("=");
                const value = valueParts.join("=");
                if (key && value !== undefined) {
                  allEnvs[`${envFile}:${key}`] = value;
                }
              }
            }
            logger.info(`   ✅ 成功读取 ${envFile} 文件`);
          } catch (error) {
            logger.info(`   ❌ 读取 ${envFile} 文件失败:`, error);
          }
        }
      }

      // 2. 读取Docker环境变量
      logger.info("🐳 [EnvManager] 开始读取Docker环境变量...");
      const dockerEnvVars = [
        "DOCKER_HOST",
        "DOCKER_TLS_VERIFY",
        "DOCKER_CERT_PATH",
        "COMPOSE_PROJECT_NAME",
        "COMPOSE_FILE",
        "DOCKER_BUILDKIT",
        "DOCKER_DEFAULT_PLATFORM",
      ];

      for (const dockerVar of dockerEnvVars) {
        if (process.env[dockerVar]) {
          allEnvs[`DOCKER:${dockerVar}`] = process.env[dockerVar];
        }
      }

      // 3. 读取Node.js相关环境变量
      logger.info("🟢 [EnvManager] 开始读取Node.js环境变量...");
      const nodeEnvVars = [
        "NODE_ENV",
        "NODE_VERSION",
        "NODE_PATH",
        "NODE_OPTIONS",
        "NPM_CONFIG_PREFIX",
        "NPM_CONFIG_CACHE",
        "YARN_CACHE_FOLDER",
      ];

      for (const nodeVar of nodeEnvVars) {
        if (process.env[nodeVar]) {
          allEnvs[`NODE:${nodeVar}`] = process.env[nodeVar];
        }
      }

      // 4. 读取系统环境变量
      logger.info("💻 [EnvManager] 开始读取系统环境变量...");
      const systemEnvVars = [
        "PATH",
        "HOME",
        "USER",
        "SHELL",
        "LANG",
        "LC_ALL",
        "TZ",
        "PWD",
        "HOSTNAME",
        "OSTYPE",
        "PLATFORM",
      ];

      for (const sysVar of systemEnvVars) {
        if (process.env[sysVar]) {
          allEnvs[`SYSTEM:${sysVar}`] = process.env[sysVar];
        }
      }

      // 5. 读取数据库相关环境变量
      logger.info("🗄️ [EnvManager] 开始读取数据库环境变量...");
      const dbEnvVars = [
        "MONGO_URI",
        "MYSQL_URI",
        "REDIS_URL",
        "POSTGRES_URL",
        "DB_HOST",
        "DB_PORT",
        "DB_NAME",
        "DB_USER",
        "DB_PASSWORD",
      ];

      for (const dbVar of dbEnvVars) {
        if (process.env[dbVar]) {
          // 对于包含敏感信息的变量，只显示部分内容
          const value = process.env[dbVar];
          if (dbVar.includes("PASSWORD") || dbVar.includes("URI") || dbVar.includes("URL")) {
            const maskedValue = adminController.maskSensitiveValue(value);
            allEnvs[`DB:${dbVar}`] = maskedValue;
          } else {
            allEnvs[`DB:${dbVar}`] = value;
          }
        }
      }

      // 6. 读取应用配置环境变量
      logger.info("⚙️ [EnvManager] 开始读取应用配置环境变量...");
      const appEnvVars = [
        "PORT",
        "HOST",
        "API_BASE_URL",
        "JWT_SECRET",
        "ADMIN_PASSWORD",
        "STORAGE_MODE",
        "LOG_LEVEL",
        "CORS_ORIGIN",
        "RATE_LIMIT_WINDOW",
        "RATE_LIMIT_MAX",
      ];

      for (const appVar of appEnvVars) {
        if (process.env[appVar]) {
          // 对于敏感信息进行脱敏处理
          const value = process.env[appVar];
          if (appVar.includes("SECRET") || appVar.includes("PASSWORD") || appVar.includes("KEY")) {
            const maskedValue = adminController.maskSensitiveValue(value);
            allEnvs[`APP:${appVar}`] = maskedValue;
          } else {
            allEnvs[`APP:${appVar}`] = value;
          }
        }
      }

      // 7. 合并env模块的导出
      logger.info("📦 [EnvManager] 开始合并env模块导出...");
      if (envModule.env && typeof envModule.env === "object") {
        allEnvs = { ...allEnvs, ...envModule.env };
      }
      for (const [k, v] of Object.entries(envModule)) {
        if (k !== "env") {
          allEnvs[`MODULE:${k}`] = v;
        }
      }

      // 8. 读取所有process.env变量（排除已处理的）
      logger.info("🌐 [EnvManager] 开始读取所有process.env变量...");
      const processedKeys = new Set(
        Object.keys(allEnvs).map((key) => {
          const parts = key.split(":");
          return parts.length > 1 ? parts[1] : key;
        }),
      );

      for (const [key, value] of Object.entries(process.env)) {
        if (!processedKeys.has(key) && value !== undefined) {
          // 跳过一些系统内部变量
          if (!key.startsWith("npm_") && !key.startsWith("npm_config_")) {
            allEnvs[`ENV:${key}`] = value;
          }
        }
      }

      logger.info("📊 [EnvManager] 收集到环境变量数量:", Object.keys(allEnvs).length);

      // 将环境变量转换为数组格式并按类别排序
      const envArray = Object.entries(allEnvs)
        .map(([key, value]) => ({
          key,
          value: String(value),
          category: key.split(":")[0] || "OTHER",
        }))
        .sort((a, b) => {
          // 按类别排序
          const categoryOrder = ["APP", "DB", "DOCKER", "NODE", "SYSTEM", "MODULE", "ENV"];
          const aIndex = categoryOrder.indexOf(a.category);
          const bIndex = categoryOrder.indexOf(b.category);
          if (aIndex !== bIndex) {
            return aIndex - bIndex;
          }
          // 同类别内按key排序
          return a.key.localeCompare(b.key);
        });

      logger.info("🔄 [EnvManager] 环境变量转换为数组格式完成");
      logger.info("   数组长度:", envArray.length);
      logger.info(
        "   类别统计:",
        envArray.reduce(
          (acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      );

      // 准备加密数据
      const jsonData = JSON.stringify(envArray);
      logger.info("📝 [EnvManager] JSON数据准备完成，长度:", jsonData.length);

      // 使用AES-256-CBC加密数据
      logger.info("🔐 [EnvManager] 开始AES-256-CBC加密...");
      const algorithm = "aes-256-cbc";

      // 生成密钥
      logger.info("   生成密钥...");
      const key = crypto.createHash("sha256").update(token).digest();
      logger.info("   密钥生成完成，长度:", key.length);

      // 生成IV
      logger.info("   生成初始化向量(IV)...");
      const iv = crypto.randomBytes(16);
      logger.info("   IV生成完成，长度:", iv.length);
      logger.info("   IV (hex):", iv.toString("hex"));

      // 创建加密器
      logger.info("   创建加密器...");
      const cipher = crypto.createCipheriv(algorithm, key, iv);

      // 执行加密
      logger.info("   开始加密数据...");
      let encrypted = cipher.update(jsonData, "utf8", "hex");
      encrypted += cipher.final("hex");

      logger.info("✅ [EnvManager] 加密完成");
      logger.info("   原始数据长度:", jsonData.length);
      logger.info("   加密后数据长度:", encrypted.length);
      logger.info("   加密算法:", algorithm);
      logger.info("   密钥长度:", key.length);
      logger.info("   IV长度:", iv.length);

      // 返回加密后的数据
      const response = {
        success: true,
        data: encrypted,
        iv: iv.toString("hex"),
      };

      logger.info("📤 [EnvManager] 准备返回加密数据");
      logger.info("   响应数据大小:", JSON.stringify(response).length);

      res.json(response);

      logger.info("✅ [EnvManager] 环境变量加密请求处理完成");
    } catch (e) {
      logger.error("❌ [EnvManager] 获取环境变量失败:", e);
      logger.error("获取环境变量失败:", e);
      res.status(500).json({ success: false, error: "获取环境变量失败" });
    }
  },

  // 脱敏敏感信息
  maskSensitiveValue(value: string | undefined): string {
    if (!value || value.length < 4) {
      return "***";
    }
    // 确保 visibleChars * 2 不超过字符串长度，避免 repeat 负数异常
    const visibleChars = Math.max(1, Math.min(4, Math.floor(value.length * 0.2)));
    const maskedChars = Math.max(0, value.length - visibleChars * 2);
    return value.substring(0, visibleChars) + "*".repeat(maskedChars) + value.substring(value.length - visibleChars);
  },

  // 新增/更新环境变量（仅管理员）
  async setEnv(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      const { key, value, desc } = req.body;
      if (typeof key !== "string" || !key.trim() || key.length > 64 || /[<>\s]/.test(key))
        return res.status(400).json({ error: "key不能为空，不能包含空格/<>，且不超过64字" });
      if (typeof value !== "string" || !value.trim() || value.length > 1024)
        return res.status(400).json({ error: "value不能为空且不超过1024字" });
      const envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === key);
      const now = new Date().toISOString();
      if (idx >= 0) {
        envs[idx] = { ...envs[idx], value, desc, updatedAt: now };
      } else {
        envs.push({ key, value, desc, updatedAt: now });
      }
      writeEnvFile(envs);
      logger.info(`[环境变量] 管理员${req.user.username} 设置/更新 key=${key}`);
      res.json({ success: true, envs });
    } catch (_e) {
      res.status(500).json({ success: false, error: "保存环境变量失败" });
    }
  },

  // 删除环境变量（仅管理员）
  async deleteEnv(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      const { key } = req.body;
      if (typeof key !== "string" || !key.trim()) return res.status(400).json({ error: "key不能为空" });
      const envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === key);
      if (idx === -1) return res.status(404).json({ error: "key不存在" });
      envs.splice(idx, 1);
      writeEnvFile(envs);
      logger.info(`[环境变量] 管理员${req.user.username} 删除 key=${key}`);
      res.json({ success: true, envs });
    } catch (_e) {
      res.status(500).json({ success: false, error: "删除环境变量失败" });
    }
  },

  // ========== OutEmail 设置管理（仅管理员）===========
  async getOutemailSettings(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const list = await OutEmailSettingModel.find({}).sort({ updatedAt: -1 }).lean();
      // 返回时对 code 做部分脱敏显示
      const safe = list.map((it: any) => ({
        domain: it.domain || "",
        code:
          typeof it.code === "string" && it.code.length > 8 ? `${it.code.slice(0, 2)}***${it.code.slice(-4)}` : "***",
        updatedAt: it.updatedAt,
      }));
      return res.json({ success: true, settings: safe });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取设置失败" });
    }
  },

  async setOutemailSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { domain, code } = req.body || {};
      const safeDomain = typeof domain === "string" ? domain.trim() : "";
      if (typeof code !== "string" || code.trim().length < 1 || code.length > 256) {
        return res.status(400).json({ error: "无效的校验码" });
      }
      const now = new Date();
      const doc = await OutEmailSettingModel.findOneAndUpdate(
        { domain: safeDomain },
        { code: code, updatedAt: now },
        { upsert: true, new: true },
      );
      return res.json({ success: true, setting: { domain: doc.domain, updatedAt: doc.updatedAt } });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存设置失败" });
    }
  },

  async deleteOutemailSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { domain } = req.body || {};
      const safeDomain = typeof domain === "string" ? domain.trim() : "";
      await OutEmailSettingModel.deleteOne({ domain: safeDomain });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除设置失败" });
    }
  },

  // ========== Modlist MODIFY_CODE 设置管理（仅管理员）===========
  async getModlistSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const doc = await ModlistSettingModel.findOne({ key: "MODIFY_CODE" }).lean();
      const setting = doc
        ? {
          code:
            typeof (doc as any).code === "string" && (doc as any).code.length > 8
              ? `${(doc as any).code.slice(0, 2)}***${(doc as any).code.slice(-4)}`
              : "***",
          updatedAt: (doc as any).updatedAt,
        }
        : null;
      return res.json({ success: true, setting });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取修改码失败" });
    }
  },

  async setModlistSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { code } = req.body || {};
      if (typeof code !== "string" || code.trim().length < 1 || code.length > 256) {
        return res.status(400).json({ error: "无效的修改码" });
      }
      const now = new Date();
      const doc = await ModlistSettingModel.findOneAndUpdate(
        { key: "MODIFY_CODE" },
        { code, updatedAt: now },
        { upsert: true, new: true },
      );
      return res.json({ success: true, setting: { updatedAt: doc.updatedAt } });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存修改码失败" });
    }
  },

  async deleteModlistSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await ModlistSettingModel.deleteOne({ key: "MODIFY_CODE" });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除修改码失败" });
    }
  },

  // ========== TTS GENERATION_CODE 设置管理（仅管理员）===========
  async getTtsSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const doc = await TtsSettingModel.findOne({ key: "GENERATION_CODE" }).lean();
      const setting = doc
        ? {
          code:
            typeof (doc as any).code === "string" && (doc as any).code.length > 8
              ? `${(doc as any).code.slice(0, 2)}***${(doc as any).code.slice(-4)}`
              : "***",
          updatedAt: (doc as any).updatedAt,
        }
        : null;
      return res.json({ success: true, setting });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取生成码失败" });
    }
  },

  async setTtsSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { code } = req.body || {};
      if (typeof code !== "string" || code.trim().length < 1 || code.length > 256) {
        return res.status(400).json({ error: "无效的生成码" });
      }
      const now = new Date();
      const doc = await TtsSettingModel.findOneAndUpdate(
        { key: "GENERATION_CODE" },
        { code, updatedAt: now },
        { upsert: true, new: true },
      );
      return res.json({ success: true, setting: { updatedAt: doc.updatedAt } });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存生成码失败" });
    }
  },

  async deleteTtsSetting(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await TtsSettingModel.deleteOne({ key: "GENERATION_CODE" });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除生成码失败" });
    }
  },

  // ========== Webhook Secret 设置管理（仅管理员）===========
  async getWebhookSecret(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const routeKey =
        typeof req.query.key === "string" && req.query.key ? String(req.query.key).trim().toUpperCase() : "DEFAULT";
      const doc = await WebhookSecretModel.findOne({ provider: "resend", key: routeKey }).lean();
      if (!doc) return res.json({ success: true, secret: null, updatedAt: null });
      const value = (doc as any).secret || "";
      const masked = value.length > 8 ? `${value.slice(0, 2)}***${value.slice(-4)}` : "***";
      return res.json({ success: true, secret: masked, updatedAt: (doc as any).updatedAt, key: routeKey });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取 Webhook 密钥失败" });
    }
  },

  async setWebhookSecret(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { key, secret } = req.body || {};
      const routeKey = typeof key === "string" && key ? String(key).trim().toUpperCase() : "DEFAULT";
      if (typeof secret !== "string" || !secret.trim() || secret.length > 1024) {
        return res.status(400).json({ success: false, error: "无效的密钥" });
      }
      const now = new Date();
      await WebhookSecretModel.findOneAndUpdate(
        { provider: "resend", key: routeKey },
        { secret: secret.trim(), updatedAt: now },
        { upsert: true },
      );
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存 Webhook 密钥失败" });
    }
  },

  async deleteWebhookSecret(req: Request, res: Response) {
    try {
      if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { key } = req.body || {};
      const routeKey = typeof key === "string" && key ? String(key).trim().toUpperCase() : "DEFAULT";
      await WebhookSecretModel.deleteOne({ provider: "resend", key: routeKey });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除 Webhook 密钥失败" });
    }
  },
};
