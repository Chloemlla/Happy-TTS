import express from "express";
import { adminController } from "../../controllers/adminController";
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
  authenticateSuperAdmin,
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
  authenticateSuperAdmin,
  auditLog({ module: "env", action: "env.delete", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.deleteEnv,
);

// OutEmail settings management (admin)
router.get("/outemail/settings", adminController.getOutemailSettings);
router.post("/outemail/settings", authenticateSuperAdmin, adminController.setOutemailSetting);
router.delete("/outemail/settings", authenticateSuperAdmin, adminController.deleteOutemailSetting);

// Modlist MODIFY_CODE management (admin)
router.get("/modlist/setting", adminController.getModlistSetting);
router.post("/modlist/setting", authenticateSuperAdmin, adminController.setModlistSetting);
router.delete("/modlist/setting", authenticateSuperAdmin, adminController.deleteModlistSetting);

// TTS GENERATION_CODE management (admin)
router.get("/tts/setting", adminController.getTtsSetting);
router.post("/tts/setting", authenticateSuperAdmin, adminController.setTtsSetting);
router.delete("/tts/setting", authenticateSuperAdmin, adminController.deleteTtsSetting);
router.get("/tts/provider", ttsProviderController.getAdminConfig);
router.put(
  "/tts/provider",
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
router.post("/email-system/setting", authenticateSuperAdmin, adminController.setEmailSystemSetting);
router.delete("/email-system/setting", authenticateSuperAdmin, adminController.deleteEmailSystemSetting);

// Runtime config management (admin)
router.get("/ipqs/setting", adminController.getIpqsSetting);
router.post("/ipqs/setting", authenticateSuperAdmin, adminController.setIpqsSetting);
router.delete("/ipqs/setting", authenticateSuperAdmin, adminController.deleteIpqsSetting);
router.get("/linuxdo/setting", adminController.getLinuxDoSetting);
router.post("/linuxdo/setting", authenticateSuperAdmin, adminController.setLinuxDoSetting);
router.delete("/linuxdo/setting", authenticateSuperAdmin, adminController.deleteLinuxDoSetting);
router.get("/google-auth/setting", adminController.getGoogleAuthSetting);
router.post("/google-auth/setting", authenticateSuperAdmin, adminController.setGoogleAuthSetting);
router.delete("/google-auth/setting", authenticateSuperAdmin, adminController.deleteGoogleAuthSetting);
router.get("/synapse-android/setting", adminController.getSynapseAndroidSetting);
router.post("/synapse-android/setting", authenticateSuperAdmin, adminController.setSynapseAndroidSetting);
router.delete("/synapse-android/setting", authenticateSuperAdmin, adminController.deleteSynapseAndroidSetting);
router.get("/deeplx/setting", adminController.getDeepLXSetting);
router.post("/deeplx/setting", authenticateSuperAdmin, adminController.setDeepLXSetting);
router.delete("/deeplx/setting", authenticateSuperAdmin, adminController.deleteDeepLXSetting);
router.get("/nexai/setting", adminController.getNexaiSetting);
router.post("/nexai/setting", authenticateSuperAdmin, adminController.setNexaiSetting);
router.delete("/nexai/setting", authenticateSuperAdmin, adminController.deleteNexaiSetting);
// NexAI request-signature middleware config (NEXAI_REQUEST_SIGNING / NEXAI_APP_SIGN_SECRET(_PREV) / NEXAI_SIG_MAX_DRIFT_MS)
router.get("/nexai-signing/setting", adminController.getNexaiSigningSetting);
router.post("/nexai-signing/setting", authenticateSuperAdmin, adminController.setNexaiSigningSetting);
router.delete("/nexai-signing/setting", authenticateSuperAdmin, adminController.deleteNexaiSigningSetting);
router.get("/admin-security/setting", adminController.getAdminSecuritySetting);
router.post("/admin-security/setting", authenticateSuperAdmin, adminController.setAdminSecuritySetting);
router.delete("/admin-security/setting", authenticateSuperAdmin, adminController.deleteAdminSecuritySetting);

// Webhook Secret management (admin)
router.get("/webhook/secret", adminController.getWebhookSecret);
router.post("/webhook/secret", authenticateSuperAdmin, adminController.setWebhookSecret);
router.delete("/webhook/secret", authenticateSuperAdmin, adminController.deleteWebhookSecret);

// Project Lumen config management (admin)
router.get("/lumen-config", adminController.getLumenConfig);
router.post(
  "/lumen-config",
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.set", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.setLumenConfig,
);
router.delete(
  "/lumen-config",
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.delete", extractDetail: (req) => ({ key: req.body.key }) }),
  adminController.deleteLumenConfig,
);
router.delete(
  "/lumen-config/:key",
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.delete", extractDetail: (req) => ({ key: req.params.key }) }),
  adminController.deleteLumenConfig,
);
router.post(
  "/lumen-config/sync-github",
  authenticateSuperAdmin,
  auditLog({ module: "lumen-config", action: "lumen-config.sync-github", extractDetail: () => ({}) }),
  adminController.syncLumenConfigGithub,
);

export default router;
