import * as crypto from "node:crypto";
import express from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { adminController } from "../../controllers/adminController";
import { auditLog } from "../../middleware/auditLog";
import { replayProtection } from "../../middleware/replayProtection";

const router = express.Router();

const revealPasswordLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: "查看密码操作过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || req.socket?.remoteAddress || "unknown",
  skip: (req: any) => req.isLocalIp || false,
});

const revealPasswordSessions = new Map<string, { adminId: string; targetUserId: string; expiresAt: number }>();
const REVEAL_PASSWORD_SESSION_TTL_MS = 2 * 60 * 1000;

function createRevealPasswordSession(adminId: string, targetUserId: string) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + REVEAL_PASSWORD_SESSION_TTL_MS;
  revealPasswordSessions.set(token, { adminId, targetUserId, expiresAt });
  return { token, expiresAt };
}

function validateRevealPasswordSession(token: string, adminId: string, targetUserId: string): boolean {
  const session = revealPasswordSessions.get(token);
  if (!session) return false;
  if (session.adminId !== adminId || session.targetUserId !== targetUserId) return false;
  if (session.expiresAt < Date.now()) {
    revealPasswordSessions.delete(token);
    return false;
  }
  revealPasswordSessions.delete(token);
  return true;
}

function applyNoCacheHeaders(res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

// 管理员清空指定用户的全部指纹记录（需管理员权限）
router.delete("/users/:id/fingerprints", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });

    const { getUserById, updateUser } = require("../../services/userService");
    const target = await getUserById(userId);
    if (!target) return res.status(404).json({ error: "用户不存在" });

    await updateUser(userId, { fingerprints: [] } as any);
    return res.json({ success: true, fingerprints: [] });
  } catch (e) {
    console.error("清空指纹失败", e);
    return res.status(500).json({ error: "清空指纹失败" });
  }
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
router.post(
  "/users/:id/reveal-password",
  replayProtection,
  revealPasswordLimiter,
  auditLog({
    module: "user",
    action: "user.password.reveal",
    extractTarget: (req) => ({ targetId: req.params.id }),
    extractDetail: (req) => ({ reason: req.body?.reason || "" }),
  }),
  async (req: Request & { user?: any }, res: Response) => {
    applyNoCacheHeaders(res);
    const targetUserId = Array.isArray(req.params.id) ? req.params.id[0] || "" : req.params.id || "";
    const adminId = req.user?.id;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";

    if (!adminId || !targetUserId) {
      return res.status(400).json({ error: "参数缺失" });
    }
    if (!reason || reason.length < 4 || reason.length > 200) {
      return res.status(400).json({ error: "请填写查看原因（4-200字符）" });
    }
    if (!verificationToken || !validateRevealPasswordSession(verificationToken, adminId, targetUserId)) {
      return res.status(401).json({ error: "二次鉴权已过期，请重新验证" });
    }

    return adminController.revealUserPassword(req, res);
  },
);

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
    const { getUserById, updateUser } = require("../../services/userService");
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
    const { wsService } = require("../../services/wsService");
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

router.post("/users/:id/reveal-password/verify", async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
    const targetUserId = Array.isArray(req.params.id) ? req.params.id[0] || "" : req.params.id || "";
    if (!targetUserId) return res.status(400).json({ error: "缺少用户ID" });

    const { getUserAuthById } = require("../../services/userService");
    const dbUser = await getUserAuthById(user.id);
    if (!dbUser) {
      return res.status(404).json({ error: "管理员用户不存在" });
    }

    const method = typeof req.body?.method === "string" ? req.body.method : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const verificationCode = typeof req.body?.verificationCode === "string" ? req.body.verificationCode.trim() : "";

    if (!method || !["password", "totp", "passkey"].includes(method)) {
      return res.status(400).json({ error: "无效的验证方式" });
    }

    const { UserStorage } = require("../../utils/userStorage");

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
      const { TOTPService } = require("../../services/totpService");
      if (!TOTPService.verifyToken(verificationCode, dbUser.totpSecret)) {
        return res.status(401).json({ error: "TOTP 验证失败" });
      }
    }

    if (method === "passkey") {
      if (!dbUser.passkeyEnabled || !Array.isArray(dbUser.passkeyCredentials) || dbUser.passkeyCredentials.length === 0) {
        return res.status(400).json({ error: "当前账户未启用 Passkey" });
      }
      if (!req.body?.passkeyResponse || typeof req.body.passkeyResponse !== "object") {
        return res.status(400).json({ error: "缺少 Passkey 验证数据" });
      }
      const { PasskeyService } = require("../../services/passkeyService");
      const clientOrigin =
        (typeof req.headers.origin === "string" ? req.headers.origin : undefined) || "https://tts.chloemlla.com";
      const verification = await PasskeyService.verifyAuthentication(
        dbUser,
        req.body.passkeyResponse,
        clientOrigin,
        clientOrigin,
      );
      if (!verification?.verified) {
        return res.status(401).json({ error: "Passkey 验证失败" });
      }
    }

    const session = createRevealPasswordSession(dbUser.id, targetUserId);
    return res.json({
      success: true,
      verificationToken: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("[AdminRoutes] 查看密码二次验证失败:", error);
    return res.status(500).json({ error: "二次验证失败" });
  }
});

// 管理员查询指定用户的指纹预约状态（需管理员权限）
router.get("/users/:id/fingerprint/require/status", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });
    const { getUserById } = require("../../services/userService");
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

// 管理员删除指定用户的一条指纹记录（需管理员权限）
router.delete("/users/:id/fingerprints/:fpId", async (req, res) => {
  try {
    // adminAuthMiddleware 已在上方全局应用，此处为管理员接口
    const userId = req.params.id;
    const fpId = req.params.fpId;
    if (!userId || !fpId) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

    const { getUserById, updateUser } = require("../../services/userService");
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

export default router;
