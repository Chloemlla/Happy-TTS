import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { EmailService, getAllSenderDomains, getOutEmailServiceStatus } from "../services/emailService";
import { sendEmail } from "../services/emailSender";
import { mongoose } from "../services/mongoService";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import { TranslationLogService } from "../services/translationLogService";
import { getGithubTarget, pushRepoSecret } from "../services/githubSecretService";
import { BilibiliSyncModel } from "../models/bilibiliSyncModel";
import { ProjectLumenConfigModel } from "../models/projectLumenConfigModel";
import { PROTECTED_ENV_KEYS } from "../config/protectedEnvKeys";
import { sanitizeAnnouncementForOutput } from "../utils/announcementHtml";
import { validateGenerationCodeStrength } from "../utils/generationCodePolicy";
import logger from "../utils/logger";
import { isAdminRole, isSuperAdmin } from "../middleware/auth";
import { buildAccountSecuritySummary } from "../services/accountSecuritySummaryService";
import { type User, UserStorage } from "../utils/userStorage";
import { isUserStorageModeKey, USER_STORAGE_MODE } from "../utils/userStorageMode";
import {
  ADMIN_USER_BULK_ACTIONS,
  getAdminUserBulkActionUpdates,
  isTruthyQueryFlag,
  isValidUserId,
  parseAdminUserListQuery,
  sanitizeAdminUserForList,
  stripSensitiveUserFields,
  validateAndSanitizeUserUpdates,
  VALID_ANNOUNCEMENT_FORMATS,
} from "./adminUserListHelpers";

const ANNOUNCEMENT_FILE = path.join(__dirname, "../../data/announcement.json");
const ENV_FILE = path.join(__dirname, "../../data/env.admin.json");

// G4-05: 可读环境变量白名单（只回显这些键，且值脱敏），防止把整个 process.env 导出。
const ENV_READ_WHITELIST: string[] = [
  "NODE_ENV",
  "PORT",
  "HOST",
  "API_BASE_URL",
  "FRONTEND_URL",
  "BASE_URL",
  "USER_STORAGE_MODE",
  "STORAGE_MODE",
  "LOG_LEVEL",
  "CORS_ORIGIN",
  "RATE_LIMIT_WINDOW",
  "RATE_LIMIT_MAX",
  "RESEND_DOMAIN",
  "RESEND_QUOTA_TOTAL",
  "OUTEMAIL_DOMAIN",
  "OUTEMAIL_QUOTA_TOTAL",
  "DEFAULT_TTS_PROVIDER",
  "DEFAULT_TTS_MODEL",
  "TTS_REQUIRE_POLICY_CONSENT",
  "TURNSTILE_SITE_KEY",
  "HCAPTCHA_SITE_KEY",
  "GOOGLE_CLIENT_ID",
  "NEXAI_GOOGLE_CLIENT_ID",
  "NEXAI_GITHUB_CLIENT_ID",
  "NEXAI_FRONTEND_URL",
  // 安全密钥隔离 / 数据采集加密：白名单不含这些 key 时 getEnvs 永不返回，面板恒显“未设置”。
  "DATA_COLLECTION_RAW_SECRET",
  "BILIBILI_COOKIE_ENCRYPTION_KEY",
  "PASSWORD_ENCRYPTION_KEY",
  "POLICY_SECRET_SALT",
  "VERIFICATION_TOKEN_SECRET",
  "TTS_ASSET_ACCESS_SECRET",
  "LEGACY_API_CHOICE_SECRET",
  "LUMEN_ADMIN_AUTOMATION_TOKEN",
  // EcoEnchants 令牌 / 支付 Webhook 密钥：前端 EcoEnchantsTokenSection / WebhookSection 亦从
  // getEnvs 读取并匹配（含 alt 旧名），缺白名单时已配置 key 同样恒显“未设置”。
  "ECOENCHANTS_LICENSE_PEPPER",
  "LICENSE_KEY_PEPPER",
  "ECOENCHANTS_ACTIVATION_TOKEN_SECRET",
  "ECOENCHANTS_RUNTIME_TOKEN_SECRET",
  "ECOENCHANTS_OPS_TOKEN_SECRET",
  "ECOENCHANTS_DOWNLOAD_TOKEN_SECRET",
  "ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET",
  "ECOENCHANTS_STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET",
  "ECOENCHANTS_POLYMART_WEBHOOK_SECRET",
  "POLYMART_WEBHOOK_SECRET",
  "ECOENCHANTS_PAYPAL_WEBHOOK_SECRET",
  "PAYPAL_WEBHOOK_SECRET",
];

// G4-06: 禁止通过运行时 envs 接口改写的键，清单见 config/protectedEnvKeys.ts。
// 大小写归一化跟重放侧（config/env.ts）保持一致，否则写 `jwt_secret` 能过写入侧的判断。
function isProtectedEnvKey(key: string): boolean {
  return PROTECTED_ENV_KEYS.has(key.toUpperCase());
}

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ENV_FILE, "utf-8"));
  } catch {
    return [];
  }
}

// G4-06: 写盘改异步 + 先写临时文件再 rename，避免请求线程同步 IO 与半写文件。
async function writeEnvFile(envs: any[]) {
  const tmpPath = `${ENV_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(envs, null, 2), "utf-8");
  await fs.promises.rename(tmpPath, ENV_FILE);
}

function normalizeOutEmailDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeSecretInput(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function maskSecretForDisplay(value: unknown): string {
  const secret = typeof value === "string" ? value.trim() : "";
  if (!secret) return "未配置";
  if (secret.length > 8) return `${secret.slice(0, 2)}***${secret.slice(-4)}`;
  return "***";
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
    if (!collections.find((c: any) => c.name === "announcements")) {
      await db.createCollection("announcements");
    }
  }
}

const AnnouncementModel = mongoose.models.Announcement || mongoose.model("Announcement", AnnouncementSchema);

// ========== 新增：对外邮件设置集合（outemail_settings）===========
const OutEmailSettingSchema = new mongoose.Schema(
  {
    domain: { type: String, default: "" },
    code: { type: String, default: "" },
    apiKey: { type: String, default: "" },
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

async function listLumenConfigDocs(): Promise<Array<{ key: string; value: string; desc?: string; updatedAt?: string }>> {
  const docs = await ProjectLumenConfigModel.find({}).sort({ key: 1 }).lean();
  return docs.map((d) => ({
    key: d.key,
    value: d.value,
    desc: (d as any).desc || undefined,
    updatedAt: d.updatedAt ? d.updatedAt.toISOString() : undefined,
  }));
}

// XSS 过滤简单实现

/** 目标是否为唯一的超级管理员(降级/封停/删除会锁死系统)。 */
async function isLastSuperadmin(targetUser: { role?: string }): Promise<boolean> {
  if (targetUser.role !== "superadmin") return false;
  const allUsers = await UserStorage.getAllUsers();
  return allUsers.filter((u) => u.role === "superadmin").length <= 1;
}

export const adminController = {
  getUsers: async (req: Request, res: Response) => {
    try {
      if (!req.user || !isAdminRole(req.user.role)) {
        return res.status(403).json({ error: "无权限" });
      }

      const includeFingerprints = isTruthyQueryFlag(req.query.includeFingerprints);
      const listQuery = parseAdminUserListQuery(req.query);
      // G4-19: 筛选/排序/分页下推到 aggregation，不再把整张 users 表读进内存
      const pageResult = await UserStorage.getAdminUserListPage(listQuery, includeFingerprints);
      const usersSanitized = pageResult.users.map((user) => sanitizeAdminUserForList(user, includeFingerprints));
      const totalPages = Math.max(1, Math.ceil(pageResult.total / listQuery.pageSize));
      const page = Math.min(listQuery.page, totalPages);

      // G4-19: envelope 缺省时也必须分页，不能返回全量
      const responsePayload = listQuery.envelope
        ? {
            users: usersSanitized,
            pagination: {
              page,
              pageSize: listQuery.pageSize,
              total: pageResult.total,
              totalPages,
            },
            filters: {
              keyword: listQuery.keyword,
              role: listQuery.role,
              accountStatus: listQuery.accountStatus,
              security: listQuery.security,
              ticket: listQuery.ticket,
              translation: listQuery.translation,
              sortBy: listQuery.sortBy,
              sortOrder: listQuery.sortOrder,
            },
            stats: pageResult.stats,
            filteredStats: pageResult.filteredStats,
          }
        : usersSanitized;

      logger.info("[UserManagement] 用户列表读取完成", {
        total: pageResult.total,
        page,
        pageSize: listQuery.pageSize,
        includeFingerprints,
      });

      return res.json(responsePayload);
    } catch (error) {
      logger.error("获取用户列表失败:", error);
      return res.status(500).json({ error: "获取用户列表失败" });
    }
  },

  getUser: async (req: Request, res: Response) => {
    try {
      if (!isValidUserId(req.params.id)) {
        return res.status(400).json({ error: "非法的用户 ID" });
      }

      // 处理公共翻译 API 产生的伪用户 ID
      if (req.params.id === "public-api") {
        return res.json({
          success: true,
          user: {
            id: "public-api",
            username: "公共翻译 API",
            email: "",
            role: "public",
            createdAt: new Date(0).toISOString(),
          },
        });
      }

      const user = await UserStorage.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      const safeUser = stripSensitiveUserFields(user);
      return res.json({ success: true, user: safeUser });
    } catch (error) {
      logger.error("获取用户详情失败:", error);
      return res.status(500).json({ error: "获取用户详情失败" });
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
      let extraUpdates: Partial<User>;
      try {
        extraUpdates = validateAndSanitizeUserUpdates(req.body);
        // 这两个字段由 createUser 处理，避免重复覆写
        delete extraUpdates.username;
        delete extraUpdates.email;
      } catch (validationError: unknown) {
        return res.status(400).json({
          error: validationError instanceof Error ? validationError.message : "字段校验失败",
        });
      }

      const exist = await UserStorage.getUserByUsername(username);
      if (exist) {
        return res.status(400).json({ error: "用户名已存在" });
      }
      const user = await UserStorage.createUser(username, email, password);
      if (!user) return res.status(500).json({ error: "创建用户失败" });

      if (Object.keys(extraUpdates).length > 0) {
        await UserStorage.updateUser(user.id, extraUpdates);
      }

      const updated = await UserStorage.getUserById(user.id);
      const newUser = stripSensitiveUserFields(updated || user);
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

      // 供 PUT /api/admin/users/:id 的审计中间件读取旧角色(role.change 审计用)
      (req as any).__targetOldRole = user.role;

      // 禁止管理员修改自身角色（防止意外降权/误操作锁死系统）
      if (req.user?.id === user.id && req.body.role !== undefined && req.body.role !== user.role) {
        return res.status(403).json({ error: "不允许修改自身角色" });
      }

      // 校验并净化字段（token 在函数内不会出现在白名单）
      let updates: Partial<User>;
      try {
        updates = validateAndSanitizeUserUpdates(req.body);
      } catch (validationError: unknown) {
        return res.status(400).json({
          error: validationError instanceof Error ? validationError.message : "字段校验失败",
        });
      }

      // 禁止降级最后一个超级管理员（防止锁死系统）
      // 触发场景：将 superadmin 改为更低角色，或封停/禁用 superadmin
      if (user.role === "superadmin") {
        const isDemotion = updates.role !== undefined && updates.role !== "superadmin";
        const isLockout = updates.accountStatus === "suspended";
        if (isDemotion || isLockout) {
          const allUsers = await UserStorage.getAllUsers();
          const superadminCount = allUsers.filter((u) => u.role === "superadmin").length;
          if (superadminCount <= 1) {
            return res.status(409).json({ error: "无法降级或封停最后一个超级管理员" });
          }
        }
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

      const updated = await UserStorage.updateUser(user.id, updates);
      // G2-02: 管理员改密后撤销该用户全部会话，旧 JWT 立即失效。
      if (updates.password) {
        const { revokeAllAuthSessions } = require("../services/authSessionService");
        await revokeAllAuthSessions(user.id);
      }
      const updatedUser = stripSensitiveUserFields(updated || {});

      // 管理员修改用户信息后，发送通知邮件给用户
      // 需要通知的关键字段
      const NOTIFY_FIELDS = new Set([
        "username",
        "email",
        "role",
        "password",
        "dailyUsage",
        "totpEnabled",
        "passkeyEnabled",
        "avatarUrl",
      ]);

      // 检测实际变更的字段
      const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
      for (const [field, newVal] of Object.entries(updates)) {
        if (!NOTIFY_FIELDS.has(field)) continue;
        const oldVal = user[field as keyof User];
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
          const {
            generateAdminUserUpdatedEmailHtml,
            generateRoleChangedEmailHtml,
            generateEmailChangeOldNoticeHtml,
            generateEmailChangeNewNoticeHtml,
          } = require("../templates/emailTemplates");
          const { getClientIP } = require("../utils/ipUtils");
          const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const adminUsername = req.user?.username || "管理员";
          const clientIP = getClientIP(req);
          const deviceName = req.headers["user-agent"] || "未知设备";

          const emailHtml = generateAdminUserUpdatedEmailHtml(
            user.username,
            changeTime,
            adminUsername,
            changes,
            newPassword ? newPassword.trim() : undefined,
          );

          // 确定邮件主题
          const changedFieldNames = changes.map((c: { field: string; oldValue: string; newValue: string }) => {
            const labels: Record<string, string> = {
              username: "用户名",
              email: "邮箱",
              role: "角色",
              password: "密码",
              dailyUsage: "用量",
              totpEnabled: "两步验证",
              passkeyEnabled: "Passkey",
              avatarUrl: "头像",
            };
            return labels[c.field] || c.field;
          });
          const subject = `Synapse 账号${changedFieldNames.join("、")}被管理员修改通知`;

          // 1. 发送通用变更通知到当前邮箱
          sendEmail({
            to: user.email,
            subject,
            html: emailHtml,
            logTag: "管理员修改用户信息通知",
            checkQuota: true,
          })
            .then((result) => {
              if (result.success) {
                logger.info(`[管理员修改用户] 通知邮件成功发送到: ${user.email}`);
              } else {
                logger.warn(`[管理员修改用户] 通知邮件发送失败: ${user.email} - ${result.error}`);
              }
            })
            .catch((e) => {
              logger.warn(`[管理员修改用户] 通知邮件发送异常: ${user.email}`, e);
            });

          // 2. 针对特定字段变更发送专门模板通知
          // 2.1 角色变更通知
          const roleChange = changes.find((c) => c.field === "role");
          if (roleChange) {
            const roleEmailHtml = generateRoleChangedEmailHtml(
              user.username,
              roleChange.newValue,
              changeTime,
              clientIP,
              deviceName,
            );
            sendEmail({
              to: user.email,
              subject: "Synapse 账户权限变更通知",
              html: roleEmailHtml,
              logTag: "角色变更专门通知",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[角色变更专门通知] 成功发送到: ${user.email}`);
                } else {
                  logger.warn(`[角色变更专门通知] 发送失败: ${user.email} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[角色变更专门通知] 发送异常: ${user.email}`, e);
              });
          }

          // 2.2 邮箱变更通知 (旧邮箱和新邮箱)
          const emailChange = changes.find(
            (c: { field: string; oldValue: string; newValue: string }) => c.field === "email",
          );
          if (emailChange?.oldValue && emailChange.oldValue !== emailChange.newValue) {
            // 通知旧邮箱
            const oldEmailHtml = generateEmailChangeOldNoticeHtml(
              user.username,
              emailChange.newValue,
              changeTime,
              clientIP,
              deviceName,
            );
            sendEmail({
              to: emailChange.oldValue,
              subject: "Synapse 账户邮箱地址变更安全通知",
              html: oldEmailHtml,
              logTag: "邮箱变更安全通知(旧邮箱)",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[管理员修改用户] 旧邮箱安全通知成功发送到: ${emailChange.oldValue}`);
                } else {
                  logger.warn(`[管理员修改用户] 旧邮箱安全通知发送失败: ${emailChange.oldValue} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[管理员修改用户] 旧邮箱安全通知发送异常: ${emailChange.oldValue}`, e);
              });

            // 通知新邮箱
            const newEmailHtml = generateEmailChangeNewNoticeHtml(
              user.username,
              emailChange.oldValue,
              changeTime,
              clientIP,
              deviceName,
            );
            sendEmail({
              to: emailChange.newValue,
              subject: "Synapse 账户邮箱绑定成功通知",
              html: newEmailHtml,
              logTag: "新邮箱绑定通知",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[管理员修改用户] 新邮箱通知成功发送到: ${emailChange.newValue}`);
                } else {
                  logger.warn(`[管理员修改用户] 新邮箱通知发送失败: ${emailChange.newValue} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[管理员修改用户] 新邮箱通知发送异常: ${emailChange.newValue}`, e);
              });
          }

          logger.info(
            `[管理员修改用户] 已发送通知邮件至 ${user.email}，变更字段: ${changedFieldNames.join(", ")}，操作者: ${adminUsername}`,
          );
        } catch (notifyError) {
          logger.warn("[管理员修改用户] 发送通知邮件失败:", notifyError);
        }
      }

      // 账号停用/恢复状态变更通知（独立于通用变更邮件，仅修改 accountStatus 时也会触发）
      const statusChangedToSuspended = updates.accountStatus === "suspended" && user.accountStatus !== "suspended";
      const statusChangedToActive = updates.accountStatus === "active" && user.accountStatus === "suspended";
      if ((statusChangedToSuspended || statusChangedToActive) && user.email) {
        try {
          const { generateAccountSuspendedEmailHtml, generateAccountRestoredEmailHtml } = require(
            "../templates/emailTemplates",
          );
          const { getClientIP } = require("../utils/ipUtils");
          const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const clientIP = getClientIP(req);
          const deviceName = req.headers["user-agent"] || "未知设备";

          if (statusChangedToSuspended) {
            const emailHtml = generateAccountSuspendedEmailHtml(
              user.username,
              "由管理员根据平台规则执行",
              changeTime,
              clientIP,
              deviceName,
            );
            sendEmail({
              to: user.email,
              subject: "Synapse 账号已被停用通知",
              html: emailHtml,
              logTag: "账号停用通知",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[管理员修改用户] 停用通知邮件成功发送到: ${user.email}`);
                } else {
                  logger.warn(`[管理员修改用户] 停用通知邮件发送失败: ${user.email} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[管理员修改用户] 停用通知邮件发送异常: ${user.email}`, e);
              });
          } else {
            const emailHtml = generateAccountRestoredEmailHtml(user.username, changeTime);
            sendEmail({
              to: user.email,
              subject: "Synapse 账号已恢复使用通知",
              html: emailHtml,
              logTag: "账号恢复通知",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[管理员修改用户] 恢复通知邮件成功发送到: ${user.email}`);
                } else {
                  logger.warn(`[管理员修改用户] 恢复通知邮件发送失败: ${user.email} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[管理员修改用户] 恢复通知邮件发送异常: ${user.email}`, e);
              });
          }
        } catch (notifyError) {
          logger.warn("[管理员修改用户] 发送账号状态变更通知失败:", notifyError);
        }
      }

      res.json(updatedUser);
    } catch (error) {
      logger.error("更新用户失败:", error);
      res.status(500).json({ error: "更新用户失败" });
    }
  },

  bulkUpdateUsers: async (req: Request, res: Response) => {
    try {
      if (!req.user || !isSuperAdmin(req)) {
        return res.status(403).json({ error: "需要超级管理员权限" });
      }

      const action = typeof req.body?.action === "string" ? req.body.action.trim() : "";
      if (!ADMIN_USER_BULK_ACTIONS.has(action)) {
        return res.status(400).json({ error: "不支持的批量操作" });
      }

      if (!Array.isArray(req.body?.userIds)) {
        return res.status(400).json({ error: "userIds 必须为数组" });
      }

      const rawUserIds = req.body.userIds as unknown[];
      const userIds: string[] = Array.from(
        new Set(
          rawUserIds
            .map((id: unknown) => (typeof id === "string" ? id.trim() : ""))
            .filter((id): id is string => id.length > 0),
        ),
      );

      if (userIds.length === 0) {
        return res.status(400).json({ error: "请选择至少一个用户" });
      }

      if (userIds.length > 100) {
        return res.status(400).json({ error: "单次批量操作最多处理 100 个用户" });
      }

      // Batch-fetch all target users in one query, then bulkWrite updates.
      // Avoids N+1 round-trips over up to 100 users.
      const targetUsers = (await UserStorage.getUsersByIds(userIds)).reduce<Record<string, User>>((map, u) => {
        map[u.id] = u;
        return map;
      }, {});

      // 禁止批量封停最后一个超级管理员(防止锁死系统)
      if (action === "suspend") {
        const allUsers = await UserStorage.getAllUsers();
        const superadminCount = allUsers.filter((u) => u.role === "superadmin").length;
        if (superadminCount <= 1 && userIds.some((id) => targetUsers[id]?.role === "superadmin")) {
          return res.status(409).json({ error: "无法封停最后一个超级管理员" });
        }
      }

      const now = Date.now();
      const bulkOps: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }> = [];
      const wsNotifyTargets: Array<{ id: string; require: boolean }> = [];
      let processed = 0;
      let failed = 0;
      const results: Array<Record<string, unknown>> = [];

      for (const id of userIds) {
        try {
          if (!isValidUserId(id)) {
            throw new Error("非法的用户 ID");
          }

          const targetUser = targetUsers[id];
          if (!targetUser) {
            throw new Error("用户不存在");
          }

          if (req.user.id === targetUser.id && ["suspend", "resetMfa"].includes(action)) {
            throw new Error("不允许对当前管理员执行该操作");
          }

          const updates = getAdminUserBulkActionUpdates(action, now);
          if (!updates) {
            throw new Error("不支持的批量操作");
          }

          bulkOps.push({ updateOne: { filter: { id }, update: { $set: updates } } });

          if (action === "requireFingerprint" || action === "clearFingerprintRequirement") {
            wsNotifyTargets.push({ id, require: action === "requireFingerprint" });
          }

          processed += 1;
          results.push({
            id,
            success: true,
            user: stripSensitiveUserFields(targetUser),
          });
        } catch (itemError: unknown) {
          failed += 1;
          results.push({
            id,
            success: false,
            error: itemError instanceof Error ? itemError.message : "操作失败",
          });
        }
      }

      if (bulkOps.length > 0) {
        await UserStorage.bulkUpdateUsers(bulkOps);
      }

      // Send WebSocket notifications after all DB writes
      for (const { id, require: requireFingerprint } of wsNotifyTargets) {
        try {
          const { wsService } = require("../services/wsService");
          wsService.notifyFingerprintRequired(id, requireFingerprint);
        } catch (notifyError) {
          logger.warn("[管理员批量用户操作] 指纹 WebSocket 通知失败:", notifyError);
        }
      }

      // 批量封停/解封后发送账号状态通知邮件（仅成功处理且带邮箱的用户，fire-and-forget）
      if (action === "suspend" || action === "activate") {
        try {
          const { generateAccountSuspendedEmailHtml, generateAccountRestoredEmailHtml } = require(
            "../templates/emailTemplates",
          );
          const { getClientIP } = require("../utils/ipUtils");
          const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const clientIP = getClientIP(req);
          const deviceName = req.headers["user-agent"] || "未知设备";

          for (const resultItem of results) {
            if (!resultItem.success) continue;
            const targetUser = targetUsers[resultItem.id as string];
            if (!targetUser || !targetUser.email) continue;

            if (action === "suspend") {
              const emailHtml = generateAccountSuspendedEmailHtml(
                targetUser.username,
                "由管理员根据平台规则执行",
                changeTime,
                clientIP,
                deviceName,
              );
              sendEmail({
                to: targetUser.email,
                subject: "Synapse 账号已被停用通知",
                html: emailHtml,
                logTag: "账号停用通知",
                checkQuota: true,
              })
                .then((result) => {
                  if (result.success) {
                    logger.info(`[管理员批量操作] 停用通知邮件成功发送到: ${targetUser.email}`);
                  } else {
                    logger.warn(`[管理员批量操作] 停用通知邮件发送失败: ${targetUser.email} - ${result.error}`);
                  }
                })
                .catch((e) => {
                  logger.warn(`[管理员批量操作] 停用通知邮件发送异常: ${targetUser.email}`, e);
                });
            } else {
              const emailHtml = generateAccountRestoredEmailHtml(targetUser.username, changeTime);
              sendEmail({
                to: targetUser.email,
                subject: "Synapse 账号已恢复使用通知",
                html: emailHtml,
                logTag: "账号恢复通知",
                checkQuota: true,
              })
                .then((result) => {
                  if (result.success) {
                    logger.info(`[管理员批量操作] 恢复通知邮件成功发送到: ${targetUser.email}`);
                  } else {
                    logger.warn(`[管理员批量操作] 恢复通知邮件发送失败: ${targetUser.email} - ${result.error}`);
                  }
                })
                .catch((e) => {
                  logger.warn(`[管理员批量操作] 恢复通知邮件发送异常: ${targetUser.email}`, e);
                });
            }
          }
        } catch (notifyError) {
          logger.warn("[管理员批量用户操作] 发送账号状态通知邮件失败:", notifyError);
        }
      }

      logger.warn("[Admin] 批量用户操作", {
        adminId: req.user.id,
        adminUsername: req.user.username,
        action,
        requested: userIds.length,
        processed,
        failed,
      });

      return res.json({
        success: failed === 0,
        action,
        requested: userIds.length,
        processed,
        failed,
        results,
      });
    } catch (error) {
      logger.error("批量用户操作失败:", error);
      return res.status(500).json({ error: "批量用户操作失败" });
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

      // 禁止删除最后一个超级管理员（防止锁死系统）
      if (user.role === "superadmin") {
        const allUsers = await UserStorage.getAllUsers();
        const superadminCount = allUsers.filter((u) => u.role === "superadmin").length;
        if (superadminCount <= 1) {
          return res.status(409).json({ error: "无法删除最后一个超级管理员" });
        }
      }

      await UserStorage.deleteUser(user.id);

      // 发送账号删除通知
      if (user.email) {
        const { generateAccountDeletedEmailHtml } = require("../templates/emailTemplates");
        const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const emailHtml = generateAccountDeletedEmailHtml(user.username, changeTime);
        sendEmail({
          to: user.email,
          subject: "Synapse 账户注销成功通知",
          html: emailHtml,
          logTag: "账户删除通知",
          checkQuota: true,
        })
          .then((result) => {
            if (result.success) {
              logger.info(`[账户删除通知] 成功发送到: ${user.email}`);
            } else {
              logger.warn(`[账户删除通知] 发送失败: ${user.email} - ${result.error}`);
            }
          })
          .catch((e) => {
            logger.warn(`[账户删除通知] 发送异常: ${user.email}`, e);
          });
      }

      const deletedUser = stripSensitiveUserFields(user);
      res.json(deletedUser);
    } catch (error) {
      logger.error("删除用户失败:", error);
      res.status(500).json({ error: "删除用户失败" });
    }
  },

  getTranslationLogs: async (req: Request, res: Response) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({ error: "数据库未连接" });
      }

      const result = await TranslationLogService.query({
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.pageSize) || 20,
        userId: typeof req.query.userId === "string" ? req.query.userId : "",
        keyword: typeof req.query.keyword === "string" ? req.query.keyword : "",
        startDate: typeof req.query.startDate === "string" ? req.query.startDate : "",
        endDate: typeof req.query.endDate === "string" ? req.query.endDate : "",
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error("获取翻译日志失败:", error);
      return res.status(500).json({ error: "获取翻译日志失败" });
    }
  },

  getTranslationLogStats: async (_req: Request, res: Response) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({ error: "数据库未连接" });
      }

      const stats = await TranslationLogService.getStats();
      return res.json({ success: true, ...stats });
    } catch (error) {
      logger.error("获取翻译日志统计失败:", error);
      return res.status(500).json({ error: "获取翻译日志统计失败" });
    }
  },

  applyTranslationPenalty: async (req: Request, res: Response) => {
    try {
      if (!isValidUserId(req.params.id)) {
        return res.status(400).json({ error: "非法的用户 ID" });
      }

      if (req.params.id === "public-api") {
        return res.status(400).json({ error: "公共翻译 API 用户不可执行惩戒操作" });
      }

      const targetUser = await UserStorage.getUserById(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "用户不存在" });
      }

      const action = typeof req.body?.action === "string" ? req.body.action : "";
      const until = typeof req.body?.until === "string" ? req.body.until.trim() : "";

      if (action === "LIMIT_TRANSLATION") {
        if (!until) {
          return res.status(400).json({ error: "请提供翻译限制截止时间" });
        }
        await UserStorage.updateUser(targetUser.id, {
          translationAccessUntil: until,
        });
        return res.json({ success: true, message: "已设置翻译权限限制" });
      }

      if (action === "REVOKE_PAGE_ACCESS") {
        await UserStorage.updateUser(targetUser.id, {
          isTranslationEnabled: false,
        });
        return res.json({ success: true, message: "已停用翻译页面访问权限" });
      }

      if (action === "SUSPEND_ACCOUNT") {
        if (await isLastSuperadmin(targetUser)) {
          return res.status(409).json({ error: "无法封停最后一个超级管理员" });
        }
        await UserStorage.updateUser(targetUser.id, {
          accountStatus: "suspended",
        });
        return res.json({ success: true, message: "账户已封停" });
      }

      if (action === "DELETE_USER") {
        if (req.user?.id === targetUser.id) {
          return res.status(403).json({ error: "不允许删除自身账户" });
        }
        if (await isLastSuperadmin(targetUser)) {
          return res.status(409).json({ error: "无法删除最后一个超级管理员" });
        }
        await UserStorage.deleteUser(targetUser.id);
        return res.json({ success: true, message: "用户已删除" });
      }

      if (action === "CLEAR_TRANSLATION_RESTRICTIONS") {
        await UserStorage.updateUser(targetUser.id, {
          translationAccessUntil: "",
          isTranslationEnabled: true,
          accountStatus: "active",
        });
        return res.json({ success: true, message: "已清除翻译相关限制" });
      }

      return res.status(400).json({ error: "不支持的惩戒动作" });
    } catch (error) {
      logger.error("执行翻译惩戒失败:", error);
      return res.status(500).json({ error: "执行翻译惩戒失败" });
    }
  },

  // 获取当前公告
  async getAnnouncement(_req: Request, res: Response) {
    try {
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await ensureMongoAnnouncementCollection();
      const ann = await AnnouncementModel.findOne().sort({ updatedAt: -1 }).lean();
      return res.json({ success: true, announcement: sanitizeAnnouncementForOutput(ann) });
    } catch (_e) {
      res.status(500).json({ success: false, error: "获取公告失败" });
    }
  },

  // 设置/更新公告（仅管理员）
  async setAnnouncement(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      const { content, format } = req.body;
      if (typeof content !== "string" || !content.trim() || content.length > 2000)
        return res.status(400).json({ error: "公告内容不能为空且不超过2000字" });
      // format 枚举校验：只允许 markdown 或 html
      const safeFormat = VALID_ANNOUNCEMENT_FORMATS.has(format) ? format : "markdown";
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await ensureMongoAnnouncementCollection();
      const ann = await AnnouncementModel.create({
        content: content.trim(),
        format: safeFormat,
        updatedAt: new Date(),
      });
      logger.info(`[公告] 管理员${req.user.username} 更新公告`);
      return res.json({ success: true, announcement: sanitizeAnnouncementForOutput(ann.toObject()) });
    } catch (_e) {
      res.status(500).json({ success: false, error: "设置公告失败" });
    }
  },

  // 删除所有公告（仅管理员）
  async deleteAnnouncements(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await ensureMongoAnnouncementCollection();
      await AnnouncementModel.deleteMany({});
      return res.json({ success: true });
    } catch (_e) {
      res.status(500).json({ success: false, error: "删除公告失败" });
    }
  },

  // 获取所有环境变量
  // G4-05: 只回显白名单键，值做掩码；删除自研 AES 响应加密（密钥由 userId 派生，零安全增益），依赖 TLS。
  async getEnvs(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) {
        return res.status(403).json({ error: "无权限" });
      }

      const envs: Array<{
        key: string;
        value: string;
        length: number;
        configured: boolean;
      }> = [];

      for (const key of ENV_READ_WHITELIST) {
        const rawValue = process.env[key] ?? "";
        const value = isUserStorageModeKey(key) ? USER_STORAGE_MODE : rawValue;
        const configured = typeof rawValue === "string" && rawValue.length > 0;
        envs.push({
          key,
          value: configured ? maskSecretForDisplay(value) : "",
          length: configured ? value.length : 0,
          configured,
        });
      }

      logger.info("[EnvManager] 读取环境变量白名单完成", { count: envs.length });
      res.json({ success: true, envs });
    } catch (e) {
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
  // G4-06: 受保护键白名单（排除密钥/密码/连接串/安全开关），写盘异步 + 临时文件 rename。
  async setEnv(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      const { key, value, desc } = req.body;
      if (typeof key !== "string" || !key.trim() || key.length > 64 || /[<>\s]/.test(key))
        return res.status(400).json({ error: "key不能为空，不能包含空格/<>，且不超过64字" });
      if (typeof value !== "string" || !value.trim() || value.length > 1024)
        return res.status(400).json({ error: "value不能为空且不超过1024字" });
      const normalizedKey = key.trim();
      if (isProtectedEnvKey(normalizedKey)) {
        return res.status(400).json({ error: `key=${normalizedKey} 受保护，不能通过此接口修改` });
      }
      if (isUserStorageModeKey(normalizedKey) && value.trim().toLowerCase() !== USER_STORAGE_MODE) {
        return res.status(400).json({ error: "USER_STORAGE_MODE 只允许设置为 mongo" });
      }
      const envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === normalizedKey);
      const now = new Date().toISOString();
      const nextValue = isUserStorageModeKey(normalizedKey) ? USER_STORAGE_MODE : value;
      if (idx >= 0) {
        envs[idx] = { ...envs[idx], value: nextValue, desc, updatedAt: now };
      } else {
        envs.push({ key: normalizedKey, value: nextValue, desc, updatedAt: now });
      }
      await writeEnvFile(envs);
      process.env[normalizedKey] = nextValue;
      logger.info(`[环境变量] 管理员${req.user.username} 设置/更新 key=${normalizedKey}`);
      res.json({ success: true, envs });
    } catch (_e) {
      res.status(500).json({ success: false, error: "保存环境变量失败" });
    }
  },

  // 删除环境变量（仅管理员）
  // G4-06: 受保护键不可删除。
  async deleteEnv(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      const { key } = req.body;
      if (typeof key !== "string" || !key.trim()) return res.status(400).json({ error: "key不能为空" });
      const normalizedKey = key.trim();
      if (isProtectedEnvKey(normalizedKey)) {
        return res.status(400).json({ error: `key=${normalizedKey} 受保护，不能通过此接口删除` });
      }
      const envs = readEnvFile();
      const idx = envs.findIndex((e: any) => e.key === normalizedKey);
      if (idx === -1) return res.status(404).json({ error: "key不存在" });
      envs.splice(idx, 1);
      await writeEnvFile(envs);
      delete process.env[normalizedKey];
      logger.info(`[环境变量] 管理员${req.user.username} 删除 key=${normalizedKey}`);
      res.json({ success: true, envs });
    } catch (_e) {
      res.status(500).json({ success: false, error: "删除环境变量失败" });
    }
  },

  // ========== Project Lumen 配置管理（仅管理员）===========
  async getLumenConfig(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const items = await listLumenConfigDocs();
      const target = getGithubTarget();
      return res.json({
        success: true,
        items,
        github: { owner: target.owner, repo: target.repo, tokenConfigured: Boolean(target.token) },
      });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取 Lumen 配置失败" });
    }
  },

  async setLumenConfig(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { key, value, desc } = req.body;
      if (typeof key !== "string" || !key.trim() || key.length > 64 || /[<>\s]/.test(key))
        return res.status(400).json({ error: "key 不能为空，不能包含空格/<>，且不超过 64 字" });
      if (typeof value !== "string" || !value.trim() || value.length > 2_000_000)
        return res.status(400).json({ error: "value 不能为空且不超过 2,000,000 字" });
      const safeDesc = typeof desc === "string" ? desc.trim().slice(0, 500) : "";
      const now = new Date();
      await ProjectLumenConfigModel.findOneAndUpdate(
        { key },
        { value, desc: safeDesc, updatedAt: now },
        { upsert: true },
      );
      logger.info(`[环境变量] 管理员${req.user.username} 设置/更新 key=${key}`);
      const items = await listLumenConfigDocs();
      return res.json({ success: true, items });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存 Lumen 配置失败" });
    }
  },

  async deleteLumenConfig(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const key = req.params.key || req.body.key;
      if (typeof key !== "string" || !key.trim()) return res.status(400).json({ error: "key 不能为空" });
      await ProjectLumenConfigModel.deleteOne({ key });
      logger.info(`[环境变量] 管理员${req.user.username} 删除 key=${key}`);
      const items = await listLumenConfigDocs();
      return res.json({ success: true, items });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除 Lumen 配置失败" });
    }
  },

  async syncLumenConfigGithub(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      const target = getGithubTarget();
      if (!target.configured) {
        return res.status(400).json({
          error:
            "请先在服务端配置 PROJECT_LUMEN_GITHUB_OWNER / PROJECT_LUMEN_GITHUB_REPO / PROJECT_LUMEN_GITHUB_TOKEN（token 需具备该仓库 Actions secrets 写入权限）",
        });
      }
      const keysToSync: string[] | undefined = Array.isArray(req.body?.keys) ? req.body.keys : undefined;
      let docs: Array<{ key: string; value: string }>;
      if (keysToSync) {
        docs = await ProjectLumenConfigModel.find({ key: { $in: keysToSync } })
          .select("key value")
          .lean();
      } else {
        docs = await ProjectLumenConfigModel.find({})
          .select("key value")
          .lean();
      }
      const results: Array<{ key: string; ok: boolean; status?: number; error?: string }> = [];
      for (const doc of docs) {
        if (!doc.value) {
          results.push({ key: doc.key, ok: false, error: "值为空，跳过" });
          continue;
        }
        try {
          const { status } = await pushRepoSecret(target, doc.key, doc.value);
          results.push({ key: doc.key, ok: true, status });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const statusMatch = msg.match(/\((\d+)\)/);
          const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
          results.push({ key: doc.key, ok: false, status, error: msg });
        }
      }
      const okCount = results.filter((r) => r.ok).length;
      logger.info(
        `[环境变量] 管理员${req.user.username} 同步 GitHub secrets: 共 ${results.length} 个，成功 ${okCount} 个`,
      );
      return res.json({ success: true, total: results.length, okCount, results });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "同步 GitHub secrets 失败" });
    }
  },

  // ========== OutEmail 设置管理（仅管理员）===========
  async getOutemailSettings(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const list = await OutEmailSettingModel.find({}).sort({ updatedAt: -1 }).lean();
      // 返回时对鉴权密钥做部分脱敏显示
      const safe = list.map((it: any) => ({
        domain: it.domain || "",
        code: maskSecretForDisplay(it.code),
        apiKey: maskSecretForDisplay(it.apiKey),
        hasCode: Boolean(typeof it.code === "string" && it.code.trim()),
        hasApiKey: Boolean(typeof it.apiKey === "string" && it.apiKey.trim()),
        updatedAt: it.updatedAt,
      }));
      return res.json({ success: true, settings: safe });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取设置失败" });
    }
  },

  async setOutemailSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { domain, code, apiKey } = req.body || {};
      const safeDomain = normalizeOutEmailDomain(domain);
      const nextCode = normalizeSecretInput(code, 256);
      const nextApiKey = normalizeSecretInput(apiKey, 512);
      const existing = (await OutEmailSettingModel.findOne({ domain: safeDomain }).lean()) as any;
      const preservedCode = typeof existing?.code === "string" ? existing.code : "";
      const preservedApiKey = typeof existing?.apiKey === "string" ? existing.apiKey : "";
      const finalCode = nextCode || preservedCode;
      const finalApiKey = nextApiKey || preservedApiKey;

      if (!finalCode && !finalApiKey) {
        return res.status(400).json({ error: "请至少填写校验码或外部 API Key" });
      }
      if (nextApiKey && nextApiKey.length < 8) {
        return res.status(400).json({ error: "外部 API Key 至少需要 8 位" });
      }
      const now = new Date();
      const doc = await OutEmailSettingModel.findOneAndUpdate(
        { domain: safeDomain },
        { code: finalCode, apiKey: finalApiKey, updatedAt: now },
        { upsert: true, returnDocument: "after" },
      );
      return res.json({
        success: true,
        setting: {
          domain: doc.domain,
          code: maskSecretForDisplay((doc as any).code),
          apiKey: maskSecretForDisplay((doc as any).apiKey),
          hasCode: Boolean(typeof (doc as any).code === "string" && (doc as any).code.trim()),
          hasApiKey: Boolean(typeof (doc as any).apiKey === "string" && (doc as any).apiKey.trim()),
          updatedAt: doc.updatedAt,
        },
      });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存设置失败" });
    }
  },

  async deleteOutemailSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { domain } = req.body || {};
      const safeDomain = normalizeOutEmailDomain(domain);
      await OutEmailSettingModel.deleteOne({ domain: safeDomain });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除设置失败" });
    }
  },

  // ========== Modlist MODIFY_CODE 设置管理（仅管理员）===========
  async getModlistSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
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
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { code } = req.body || {};
      if (typeof code !== "string" || code.trim().length < 1 || code.length > 256) {
        return res.status(400).json({ error: "无效的修改码" });
      }
      const now = new Date();
      const doc = await ModlistSettingModel.findOneAndUpdate(
        { key: "MODIFY_CODE" },
        { code, updatedAt: now },
        { upsert: true, returnDocument: "after" },
      );
      return res.json({ success: true, setting: { updatedAt: doc.updatedAt } });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "保存修改码失败" });
    }
  },

  async deleteModlistSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
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
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getTtsSetting();
      const setting = result.setting
        ? {
            code: result.setting.config.generationCode,
            updatedAt: result.setting.updatedAt,
          }
        : null;
      return res.json({ success: true, setting });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "获取生成码失败" });
    }
  },

  async setTtsSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { code } = req.body || {};
      if (typeof code !== "string" || code.trim().length < 1 || code.length > 256) {
        return res.status(400).json({ error: "无效的生成码" });
      }
      const validation = validateGenerationCodeStrength(code);
      if (!validation.ok) {
        return res.status(400).json({
          success: false,
          error: validation.reason.replace(/^GENERATION_CODE/, "生成码"),
        });
      }
      const result = await RuntimeConfigService.setTtsSetting({ generationCode: code });
      return res.json({ success: true, setting: { updatedAt: result.updatedAt } });
    } catch (error) {
      logger.error("保存生成码失败:", error instanceof Error ? error.message : String(error));
      return res.status(500).json({ success: false, error: "保存生成码失败" });
    }
  },

  async deleteTtsSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteTtsSetting();
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除生成码失败" });
    }
  },

  // ========== Backend email system runtime config management (admin) ===========
  async getEmailSystemSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getEmailSetting();
      const emailStatus = await EmailService.getServiceStatus();
      const outemailStatus = getOutEmailServiceStatus();
      return res.json({
        success: true,
        ...result,
        status: {
          email: emailStatus,
          outemail: outemailStatus,
        },
        domains: getAllSenderDomains(),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取邮件系统配置失败",
      });
    }
  },

  async setEmailSystemSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setEmailSetting(req.body || {});
      const emailStatus = await EmailService.getServiceStatus();
      const outemailStatus = getOutEmailServiceStatus();
      return res.json({
        success: true,
        setting: result,
        status: {
          email: emailStatus,
          outemail: outemailStatus,
        },
        domains: getAllSenderDomains(),
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存邮件系统配置失败",
      });
    }
  },

  async deleteEmailSystemSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteEmailSetting();
      const emailStatus = await EmailService.getServiceStatus();
      const outemailStatus = getOutEmailServiceStatus();
      return res.json({
        success: true,
        status: {
          email: emailStatus,
          outemail: outemailStatus,
        },
        domains: getAllSenderDomains(),
      });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "重置邮件系统配置失败" });
    }
  },

  // ========== Webhook Secret 设置管理（仅管理员）===========
  async getIpqsSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getIpqsSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 IPQS 配置失败",
      });
    }
  },

  async setIpqsSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setIpqsSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 IPQS 配置失败",
      });
    }
  },

  async deleteIpqsSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteIpqsSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除 IPQS 配置失败" });
    }
  },

  async getLinuxDoSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getLinuxDoSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 LinuxDo 配置失败",
      });
    }
  },

  async setLinuxDoSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setLinuxDoSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 LinuxDo 配置失败",
      });
    }
  },

  async deleteLinuxDoSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteLinuxDoSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除 LinuxDo 配置失败" });
    }
  },

  async getGoogleAuthSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getGoogleAuthSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 Google Auth 配置失败",
      });
    }
  },

  async setGoogleAuthSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setGoogleAuthSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 Google Auth 配置失败",
      });
    }
  },

  async deleteGoogleAuthSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteGoogleAuthSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除 Google Auth 配置失败" });
    }
  },

  async getSynapseAndroidSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getSynapseAndroidSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 Synapse Android / assetlinks 配置失败",
      });
    }
  },

  async setSynapseAndroidSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setSynapseAndroidSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 Synapse Android / assetlinks 配置失败",
      });
    }
  },

  async deleteSynapseAndroidSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteSynapseAndroidSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除 Synapse Android / assetlinks 配置失败" });
    }
  },

  async getDeepLXSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getDeepLXSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 DeepLX 配置失败",
      });
    }
  },

  async setDeepLXSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setDeepLXSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 DeepLX 配置失败",
      });
    }
  },

  async deleteDeepLXSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteDeepLXSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除 DeepLX 配置失败" });
    }
  },

  async getNexaiSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getNexaiSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 NexAI 配置失败",
      });
    }
  },

  async setNexaiSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setNexaiSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 NexAI 配置失败",
      });
    }
  },

  async deleteNexaiSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteNexaiSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除 NexAI 配置失败" });
    }
  },

  // NexAI 请求签名中间件配置；保存后当前服务进程立即使用新的运行时配置。
  async getNexaiSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getNexaiSigningSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 NexAI 请求签名配置失败",
      });
    }
  },

  async setNexaiSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setNexaiSigningSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 NexAI 请求签名配置失败",
      });
    }
  },

  async deleteNexaiSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteNexaiSigningSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "重置 NexAI 请求签名配置失败" });
    }
  },

  // QQ 群纪律机器人控制通道共享密钥配置；保存后当前服务进程立即使用新的运行时配置，
  // 机器人侧（/opt/qq-realname-guard）需同步同一份密钥才能通过 HMAC 验签。
  async getQqGuardSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getQqGuardSigningSetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 QQ 群纪律机器人签名配置失败",
      });
    }
  },

  async setQqGuardSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setQqGuardSigningSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 QQ 群纪律机器人签名配置失败",
      });
    }
  },

  async deleteQqGuardSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteQqGuardSigningSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "重置 QQ 群纪律机器人签名配置失败" });
    }
  },

  async getCdictSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getCdictSigningSetting();
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 CDict 请求签名配置失败",
      });
    }
  },

  async setCdictSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setCdictSigningSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 CDict 请求签名配置失败",
      });
    }
  },

  async deleteCdictSigningSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteCdictSigningSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "重置 CDict 请求签名配置失败" });
    }
  },

  async getLumenServerSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getLumenSetting();
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取 Lumen 服务端配置失败",
      });
    }
  },

  async setLumenServerSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setLumenSetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 Lumen 服务端配置失败",
      });
    }
  },

  async deleteLumenServerSetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteLumenSetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "重置 Lumen 服务端配置失败" });
    }
  },

  async getAdminSecuritySetting(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.getAdminSecuritySetting();
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "获取管理员安全配置失败",
      });
    }
  },

  async setAdminSecuritySetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const result = await RuntimeConfigService.setAdminSecuritySetting(req.body || {});
      return res.json({ success: true, setting: result });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存管理员安全配置失败",
      });
    }
  },

  async deleteAdminSecuritySetting(req: Request, res: Response) {
    try {
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      await RuntimeConfigService.deleteAdminSecuritySetting();
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ success: false, error: "删除管理员安全配置失败" });
    }
  },

  async getWebhookSecret(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
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
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
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
      if (!req.user || !isSuperAdmin(req)) return res.status(403).json({ error: "需要超级管理员权限" });
      if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "数据库未连接" });
      const { key } = req.body || {};
      const routeKey = typeof key === "string" && key ? String(key).trim().toUpperCase() : "DEFAULT";
      await WebhookSecretModel.deleteOne({ provider: "resend", key: routeKey });
      return res.json({ success: true });
    } catch (_e) {
      return res.status(500).json({ success: false, error: "删除 Webhook 密钥失败" });
    }
  },

  async getBilibiliSyncRecords(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (search) {
        filter.$or = [
          { userId: { $regex: search, $options: "i" } },
          { bilibiliUid: { $regex: search, $options: "i" } },
        ];
      }

      const [records, total] = await Promise.all([
        BilibiliSyncModel.find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        BilibiliSyncModel.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        data: records,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      logger.error("[AdminController] 获取 Bilibili 同步记录失败", error);
      return res.status(500).json({ success: false, error: "获取 Bilibili 同步记录失败" });
    }
  },

  async getBilibiliSearchRecords(req: Request, res: Response) {
    try {
      if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: "无权限" });
      const { userId } = req.params;
      if (!userId) return res.status(400).json({ error: "缺少 userId 参数" });

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
      const skip = (page - 1) * limit;

      const doc = await BilibiliSyncModel.findOne({ userId }).select("searchRecords").lean();
      if (!doc) return res.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });

      const records = doc.searchRecords || [];
      const total = records.length;
      const sorted = [...records].sort(
        (a, b) => new Date((b.serverUpdatedAt as Date) || 0).getTime() - new Date((a.serverUpdatedAt as Date) || 0).getTime(),
      );
      const paged = sorted.slice(skip, skip + limit);

      return res.json({
        success: true,
        data: paged,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      logger.error("[AdminController] 获取 Bilibili 搜索记录失败", error);
      return res.status(500).json({ success: false, error: "获取 Bilibili 搜索记录失败" });
    }
  },
};
