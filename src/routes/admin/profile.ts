import express from "express";
import multer from "multer";
import validator from "validator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { sendEmail } from "../../services/emailSender";
import {
  clearEmailChangeChallenge,
  clearProfileVerificationSessions,
  createEmailChangeChallenge,
  createProfileVerificationSession,
  validateEmailChangeChallenge,
  validateProfileVerificationSession,
} from "../../services/profileUpdateVerificationService";
import {
  generateEmailChangeNewNoticeHtml,
  generateEmailChangeOldNoticeHtml,
  generateVerificationCodeEmailHtml,
} from "../../templates/emailTemplates";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";

const router = express.Router();
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB限制
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    const name = (file.originalname || "").toLowerCase();
    if (mime === "image/svg+xml" || mime === "image/svg" || name.endsWith(".svg")) {
      return cb(new Error("出于安全考虑，已禁止上传 SVG 文件"));
    }
    cb(null, true);
  },
});

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
          const crypto = require("node:crypto");
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

// 用户信息更新接口（需登录）
router.post("/user/profile/verify", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const { getUserAuthById } = require("../../services/userService");
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

      const { TOTPService } = require("../../services/totpService");
      const isValid = TOTPService.verifyToken(verificationCode, dbUser.totpSecret);

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

      const { PasskeyService } = require("../../services/passkeyService");
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

router.post("/user/profile/email/send-code", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const { getUserAuthById } = require("../../services/userService");
    const dbUser = await getUserAuthById(user.id);
    if (!dbUser) {
      return res.status(404).json({ error: "用户不存在" });
    }

    const verificationToken = typeof req.body?.verificationToken === "string" ? req.body.verificationToken : "";
    const newEmail = normalizeEmail(req.body?.newEmail);

    if (!verificationToken) {
      return res.status(401).json({ error: "请先完成身份验证" });
    }

    if (!validateProfileVerificationSession(dbUser.id, verificationToken)) {
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
      verifiedBySession = Boolean(validateProfileVerificationSession(dbUser.id, verificationToken));

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
          checkQuota: false,
        }).catch((notifyError) => {
          logger.warn("[AdminRoutes] 旧邮箱通知发送失败", notifyError);
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
        checkQuota: false,
      }).catch((notifyError) => {
        logger.warn("[AdminRoutes] 新邮箱通知发送失败", notifyError);
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
    const { IPFSService } = require("../../services/ipfsService");
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
      if (!result?.web2url) {
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
    await UserStorage.updateUser(user.id, { avatarUrl: result.web2url, avatarBase64: undefined } as any);
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

    const { updateUser, getUserById } = require("../../services/userService");
    const current = await getUserById(user.id);
    const existing = (current && (current as any).fingerprints) || [];
    // 保留最新的20条指纹记录
    const next = [fingerprintRecord, ...existing].slice(0, 20);

    // 保存指纹并清除一次性上报需求标记及时间戳
    await updateUser(user.id, { fingerprints: next, requireFingerprint: false, requireFingerprintAt: 0 } as any);

    // 通过 WebSocket 推送指纹已上报确认
    try {
      const { wsService } = require("../../services/wsService");
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

// 查询用户指纹状态（需登录）：返回最近一次指纹时间与总数量及IP变更情况
router.get("/user/fingerprint/status", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "未登录" });

    const { getUserById } = require("../../services/userService");
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

    const { getUserById, updateUser } = require("../../services/userService");
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

export default router;
