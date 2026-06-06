import express from "express";
import { auditLog } from "../middleware/auditLog";
import { authenticateToken } from "../middleware/authenticateToken";
import {
  checkAccessToken,
  checkTempFingerprintStatus,
  reportFingerprint,
  reportTempFingerprint,
  verifyAccessToken,
  verifyTempFingerprint,
} from "../controllers/turnstile/fingerprintHandlers";
import {
  cleanupExpiredFingerprints,
  getFingerprintStats,
  getIpBanStats,
} from "../controllers/turnstile/statsHandlers";
import { banIp, batchBanIps, batchUnbanIps, unbanIp } from "../controllers/turnstile/ipBanHandlers";
import {
  getSchedulerStatus,
  manualCleanup,
  startScheduler,
  stopScheduler,
} from "../controllers/turnstile/schedulerHandlers";
import {
  deleteTurnstileConfig,
  getPublicConfig,
  getPublicTurnstile,
  getTurnstileConfig,
  secureCaptchaConfig,
  updateTurnstileConfig,
  verifyTurnstileToken,
} from "../controllers/turnstile/configHandlers";
import {
  deleteHCaptchaConfig,
  getHCaptchaConfig,
  updateHCaptchaConfig,
  verifyHCaptcha,
} from "../controllers/turnstile/hcaptchaHandlers";
import { getSyncStatus, syncIpBans } from "../controllers/turnstile/syncHandlers";
import {
  adminLimiter,
  authenticatedFingerprintLimiter,
  configLimiter,
  fingerprintLimiter,
  publicLimiter,
} from "../controllers/turnstile/limiters";

const router = express.Router();

// 指纹上报与验证
router.post("/fingerprint/report", authenticateToken, authenticatedFingerprintLimiter, reportFingerprint);
router.post("/temp-fingerprint", publicLimiter, reportTempFingerprint);
router.post("/verify-temp-fingerprint", fingerprintLimiter, verifyTempFingerprint);
router.post("/verify-access-token", fingerprintLimiter, verifyAccessToken);
router.get("/check-access-token/:fingerprint", fingerprintLimiter, checkAccessToken);
router.get("/temp-fingerprint/:fingerprint", fingerprintLimiter, checkTempFingerprintStatus);

// 统计与清理（管理员）
router.post("/cleanup-expired-fingerprints", authenticateToken, adminLimiter, cleanupExpiredFingerprints);
router.get("/fingerprint-stats", authenticateToken, adminLimiter, getFingerprintStats);
router.get("/ip-ban-stats", authenticateToken, adminLimiter, getIpBanStats);

// IP 封禁管理（管理员）
router.post(
  "/ban-ip",
  authenticateToken,
  adminLimiter,
  auditLog({
    module: "ipban",
    action: "ipban.ban",
    extractDetail: (req) => ({ ipAddress: req.body.ipAddress, reason: req.body.reason }),
  }),
  banIp,
);
router.post(
  "/unban-ip",
  authenticateToken,
  adminLimiter,
  auditLog({ module: "ipban", action: "ipban.unban", extractDetail: (req) => ({ ipAddress: req.body.ipAddress }) }),
  unbanIp,
);
router.post(
  "/ban-ips",
  authenticateToken,
  adminLimiter,
  auditLog({
    module: "ipban",
    action: "ipban.batchBan",
    extractDetail: (req) => ({ count: req.body.ipAddresses?.length, reason: req.body.reason }),
  }),
  batchBanIps,
);
router.post(
  "/unban-ips",
  authenticateToken,
  adminLimiter,
  auditLog({
    module: "ipban",
    action: "ipban.batchUnban",
    extractDetail: (req) => ({ count: req.body.ipAddresses?.length }),
  }),
  batchUnbanIps,
);

// 调度器（管理员）
router.get("/scheduler-status", authenticateToken, adminLimiter, getSchedulerStatus);
router.post(
  "/manual-cleanup",
  authenticateToken,
  adminLimiter,
  auditLog({ module: "system", action: "system.manualCleanup" }),
  manualCleanup,
);
router.post(
  "/scheduler/start",
  authenticateToken,
  adminLimiter,
  auditLog({ module: "system", action: "system.schedulerStart" }),
  startScheduler,
);
router.post(
  "/scheduler/stop",
  authenticateToken,
  adminLimiter,
  auditLog({ module: "system", action: "system.schedulerStop" }),
  stopScheduler,
);

/**
 * @openapi
 * /api/turnstile/config:
 *   get:
 *     summary: 获取Turnstile配置
 *     description: 获取当前Turnstile配置信息（需要认证）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Turnstile配置信息
 */
router.get("/config", authenticateToken, configLimiter, getTurnstileConfig);

/**
 * @openapi
 * /api/turnstile/public-config:
 *   get:
 *     summary: 获取Turnstile和hCaptcha公共配置
 *     description: 获取Turnstile和hCaptcha公共配置信息（无需认证）
 *     responses:
 *       200:
 *         description: 获取成功
 */
router.get("/public-config", publicLimiter, getPublicConfig);

/**
 * @openapi
 * /api/turnstile/public-turnstile:
 *   get:
 *     summary: 获取公共 Turnstile 配置
 *     description: 返回 Turnstile 是否启用及站点密钥（无需鉴权）
 *     responses:
 *       200:
 *         description: Turnstile 配置
 */
router.get("/public-turnstile", publicLimiter, getPublicTurnstile);

/**
 * @openapi
 * /api/turnstile/verify-token:
 *   post:
 *     summary: 验证 Turnstile token
 *     description: 后端使用 Turnstile secret 验证前端提交的 token（无需鉴权）
 *     responses:
 *       200:
 *         description: 验证结果
 */
router.post("/verify-token", publicLimiter, verifyTurnstileToken);

/**
 * @openapi
 * /api/turnstile/secure-captcha-config:
 *   post:
 *     summary: 获取安全的CAPTCHA配置
 *     description: 基于加密的随机选择返回对应的CAPTCHA配置信息
 *     responses:
 *       200:
 *         description: 获取成功
 */
router.post("/secure-captcha-config", publicLimiter, secureCaptchaConfig);

/**
 * @openapi
 * /api/turnstile/config:
 *   post:
 *     summary: 更新Turnstile配置
 *     description: 更新Turnstile配置信息（需要管理员权限）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.post("/config", authenticateToken, configLimiter, updateTurnstileConfig);

/**
 * @openapi
 * /api/turnstile/config/{key}:
 *   delete:
 *     summary: 删除Turnstile配置
 *     description: 删除指定的Turnstile配置（需要管理员权限）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete("/config/:key", authenticateToken, configLimiter, deleteTurnstileConfig);

/**
 * @openapi
 * /api/turnstile/hcaptcha-config:
 *   get:
 *     summary: 获取hCaptcha配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取成功
 */
router.get("/hcaptcha-config", authenticateToken, configLimiter, getHCaptchaConfig);

/**
 * @openapi
 * /api/turnstile/hcaptcha-config:
 *   post:
 *     summary: 更新hCaptcha配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.post("/hcaptcha-config", authenticateToken, configLimiter, updateHCaptchaConfig);

/**
 * @openapi
 * /api/turnstile/hcaptcha-config/{key}:
 *   delete:
 *     summary: 删除hCaptcha配置
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete("/hcaptcha-config/:key", authenticateToken, configLimiter, deleteHCaptchaConfig);

/**
 * @openapi
 * /api/turnstile/hcaptcha-verify:
 *   post:
 *     summary: 验证hCaptcha token
 *     responses:
 *       200:
 *         description: 验证结果
 */
router.post("/hcaptcha-verify", publicLimiter, verifyHCaptcha);

// IP 封禁同步（管理员）
router.post(
  "/sync-ipbans",
  authenticateToken,
  adminLimiter,
  auditLog({ module: "ipban", action: "ipban.sync" }),
  syncIpBans,
);
router.get("/sync-status", authenticateToken, adminLimiter, getSyncStatus);

export default router;
