import express from "express";
import { adminController } from "../../controllers/adminController";
import { CDictDonationController } from "../../controllers/cdictDonationController";
import { ttsProviderController } from "../../controllers/ttsProviderController";
import { authenticateSuperAdmin } from "../../middleware/auth";
import { auditLog } from "../../middleware/auditLog";

const router = express.Router();

/**
 * @openapi
 * /admin/envs:
 *   get:
 *     summary: 获取所有环境变量
 *     responses:
 *       200:
 *         description: 环境变量列表
 */
router.get(
  "/envs",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.envs.read", captureBody: false }),
  adminController.getEnvs,
);

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
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "env", action: "env.set", captureBody: false, extractDetail: (req) => ({ key: req.body.key }) }),
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
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
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
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "env", action: "env.delete", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.deleteEnv,
);

// OutEmail settings management (admin)
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/outemail/settings", adminController.getOutemailSettings);
router.post(
  "/outemail/settings",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "email", action: "email.outemail.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.setOutemailSetting,
);
router.delete(
  "/outemail/settings",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "email", action: "email.outemail.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.deleteOutemailSetting,
);

// Modlist MODIFY_CODE management (admin)
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/modlist/setting", adminController.getModlistSetting);
router.post(
  "/modlist/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.modlist.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.setModlistSetting,
);
router.delete(
  "/modlist/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.modlist.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.deleteModlistSetting,
);

// TTS GENERATION_CODE management (admin)
router.get("/tts/setting", adminController.getTtsSetting);
router.post(
  "/tts/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "tts", action: "tts.setting.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setTtsSetting,
);
router.delete(
  "/tts/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "tts", action: "tts.setting.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteTtsSetting,
);
router.get("/tts/provider", ttsProviderController.getAdminConfig);
router.put(
  "/tts/provider",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({
    module: "tts",
    action: "tts.provider.set",
    extractDetail: (req) => ({ provider: req.body?.provider, defaultModel: req.body?.defaultModel }),
  }),
  ttsProviderController.updateAdminConfig,
);

// Backend email system management (admin)
router.get("/email-system/setting", adminController.getEmailSystemSetting);
router.post(
  "/email-system/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "email", action: "email.system.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setEmailSystemSetting,
);
router.delete(
  "/email-system/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "email", action: "email.system.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteEmailSystemSetting,
);

// Runtime config management (admin)
router.get("/ipqs/setting", adminController.getIpqsSetting);
router.post(
  "/ipqs/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.ipqs.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setIpqsSetting,
);
router.delete(
  "/ipqs/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.ipqs.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteIpqsSetting,
);
router.get("/linuxdo/setting", adminController.getLinuxDoSetting);
router.post(
  "/linuxdo/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.linuxdo.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setLinuxDoSetting,
);
router.delete(
  "/linuxdo/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.linuxdo.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteLinuxDoSetting,
);
router.get("/google-auth/setting", adminController.getGoogleAuthSetting);
router.post(
  "/google-auth/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.google-auth.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setGoogleAuthSetting,
);
router.delete(
  "/google-auth/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.google-auth.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.deleteGoogleAuthSetting,
);
router.get("/synapse-android/setting", adminController.getSynapseAndroidSetting);
router.post(
  "/synapse-android/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.synapse-android.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setSynapseAndroidSetting,
);
router.delete(
  "/synapse-android/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.synapse-android.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteSynapseAndroidSetting,
);
router.get("/cdict-donation/setting", CDictDonationController.getSetting);
router.post(
  "/cdict-donation/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.cdict-donation.set" }),
  CDictDonationController.setSetting,
);
router.delete(
  "/cdict-donation/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.cdict-donation.delete" }),
  CDictDonationController.deleteSetting,
);
router.get("/cdict-donation/claims", CDictDonationController.getClaims);
router.delete(
  "/cdict-donation/claims/:id",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.cdict-donation.claim.delete" }),
  CDictDonationController.deleteClaim,
);
router.get("/deeplx/setting", adminController.getDeepLXSetting);
router.post(
  "/deeplx/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.deeplx.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setDeepLXSetting,
);
router.delete(
  "/deeplx/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.deeplx.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteDeepLXSetting,
);
router.get("/nexai/setting", adminController.getNexaiSetting);
router.post(
  "/nexai/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.nexai.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setNexaiSetting,
);
router.delete(
  "/nexai/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.nexai.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteNexaiSetting,
);
// NexAI request-signature middleware config (NEXAI_REQUEST_SIGNING / NEXAI_APP_SIGN_SECRET(_PREV) / NEXAI_SIG_MAX_DRIFT_MS)
router.get("/nexai-signing/setting", adminController.getNexaiSigningSetting);
router.post(
  "/nexai-signing/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.nexai-signing.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setNexaiSigningSetting,
);
router.delete(
  "/nexai-signing/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.nexai-signing.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteNexaiSigningSetting,
);
// QQ 群纪律机器人控制通道共享密钥 (QQ_GUARD_SIGNING / QQ_GUARD_BOT_TOKEN / QQ_GUARD_SHARED_SECRET)
router.get("/qq-guard-signing/setting", adminController.getQqGuardSigningSetting);
router.post(
  "/qq-guard-signing/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.qq-guard-signing.set", captureBody: false }),
  adminController.setQqGuardSigningSetting,
);
router.delete(
  "/qq-guard-signing/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.qq-guard-signing.delete" }),
  adminController.deleteQqGuardSigningSetting,
);
router.get("/cdict-signing/setting", adminController.getCdictSigningSetting);
router.post(
  "/cdict-signing/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.cdict-signing.set", captureBody: false }),
  adminController.setCdictSigningSetting,
);
router.delete(
  "/cdict-signing/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.cdict-signing.delete" }),
  adminController.deleteCdictSigningSetting,
);
router.get("/admin-security/setting", adminController.getAdminSecuritySetting);
router.post(
  "/admin-security/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "security", action: "security.admin-security.set", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.setAdminSecuritySetting,
);
router.delete(
  "/admin-security/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "security", action: "security.admin-security.delete", extractDetail: (req) => ({ key: (req as any).body?.key }) }),
  adminController.deleteAdminSecuritySetting,
);

// Project Lumen server-side runtime config (LUMEN_* variables), distinct from
// /lumen-config which manages the client-side PROJECT_LUMEN_* build/CI vars.
router.get("/lumen-server/setting", adminController.getLumenServerSetting);
router.post(
  "/lumen-server/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.lumen-server.set", captureBody: false }),
  adminController.setLumenServerSetting,
);
router.delete(
  "/lumen-server/setting",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "config", action: "config.lumen-server.delete" }),
  adminController.deleteLumenServerSetting,
);

// Webhook Secret management (admin)
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/webhook/secret", adminController.getWebhookSecret);
router.post(
  "/webhook/secret",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "security", action: "security.webhook-secret.set", captureBody: false }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.setWebhookSecret,
);
router.delete(
  "/webhook/secret",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "security", action: "security.webhook-secret.delete" }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.deleteWebhookSecret,
);

// Project Lumen config management (admin)
router.get("/lumen-config", adminController.getLumenConfig);
router.post(
  "/lumen-config",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.set", extractDetail: (req) => ({ key: req.body.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.setLumenConfig,
);
router.delete(
  "/lumen-config",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  (req, res) => {
    // G3-29: body 版删除契约收敛到 path 版，避免同一 handler 两套参数来源
    const key = (req.body as any)?.key;
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "缺少 key" });
    }
    res.redirect(308, `/api/admin/lumen-config/${encodeURIComponent(key)}`);
  },
);
router.delete(
  "/lumen-config/:key",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.delete", extractDetail: (req) => ({ key: req.params.key }) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.deleteLumenConfig,
);
router.post(
  "/lumen-config/sync-github",
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.sync-github", extractDetail: () => ({}) }),
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
  adminController.syncLumenConfigGithub,
);

export default router;
