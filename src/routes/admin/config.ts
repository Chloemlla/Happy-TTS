import express from "express";
import { adminController } from "../../controllers/adminController";
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

// Backend email system management (admin)
router.get("/email-system/setting", adminController.getEmailSystemSetting);
router.post("/email-system/setting", adminController.setEmailSystemSetting);
router.delete("/email-system/setting", adminController.deleteEmailSystemSetting);

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

export default router;
