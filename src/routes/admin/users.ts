import express from "express";
import { adminController } from "../../controllers/adminController";
import { authenticateSuperAdmin } from "../../middleware/auth";
import { auditLog } from "../../middleware/auditLog";
import { getUserById, updateUser } from "../../services/userService";
import { wsService } from "../../services/wsService";

const router = express.Router();

// 管理员清空指定用户的全部指纹记录（需管理员权限）
router.delete(
  "/users/:id/fingerprints",
  authenticateSuperAdmin,
  auditLog({
    module: "user",
    action: "user.fingerprint.clear",
    extractTarget: (req) => ({ targetId: req.params.id }),
  }),
  async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });

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
  authenticateSuperAdmin,
  auditLog({
    module: "user",
    action: "user.create",
    extractDetail: (req) => ({ username: req.body.username, email: req.body.email }),
  }),
  adminController.createUser,
);

router.post(
  "/users/bulk-action",
  authenticateSuperAdmin,
  auditLog({
    module: "user",
    action: "user.bulkAction",
    extractDetail: (req) => ({
      action: req.body?.action,
      count: Array.isArray(req.body?.userIds) ? req.body.userIds.length : 0,
    }),
  }),
  adminController.bulkUpdateUsers,
);

// 管理员设置指定用户下次需要上报指纹（一次性或开关）
router.post(
  "/users/:id/fingerprint/require",
  authenticateSuperAdmin,
  auditLog({
    module: "user",
    action: "user.fingerprint.require",
    extractTarget: (req) => ({ targetId: req.params.id }),
    extractDetail: (req) => ({ require: !!req.body?.requireFlag }),
  }),
  async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });
    const { require: requireFlag } = req.body || {};
    const enabled = !!requireFlag;
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
  authenticateSuperAdmin,
  auditLog({
    module: "user",
    action: (req) =>
      req.body?.role && req.body.role !== (req as any).__targetOldRole ? "user.role.change" : "user.update",
    extractTarget: (req) => ({ targetId: req.params.id }),
    extractDetail: (req) =>
      req.body?.role ? { oldRole: (req as any).__targetOldRole, newRole: req.body.role } : undefined,
  }),
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
  authenticateSuperAdmin,
  auditLog({ module: "user", action: "user.delete", extractTarget: (req) => ({ targetId: req.params.id }) }),
  adminController.deleteUser,
);

router.get("/translation-logs", adminController.getTranslationLogs);
router.get("/translation-logs/stats", adminController.getTranslationLogStats);
router.post(
  "/users/:id/translation-penalty",
  authenticateSuperAdmin,
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
  authenticateSuperAdmin,
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
  authenticateSuperAdmin,
  auditLog({ module: "announcement", action: "announcement.delete" }),
  adminController.deleteAnnouncements,
);

// 管理员查询指定用户的指纹预约状态（需管理员权限）
router.get("/users/:id/fingerprint/require/status", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "缺少用户ID" });
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
router.delete(
  "/users/:id/fingerprints/:fpId",
  authenticateSuperAdmin,
  auditLog({
    module: "user",
    action: "user.fingerprint.delete",
    extractTarget: (req) => ({ targetId: req.params.id }),
  }),
  async (req, res) => {
  try {
    // adminAuthMiddleware 已在上方全局应用，此处为管理员接口
    const userId = req.params.id;
    const fpId = req.params.fpId;
    if (!userId || !fpId) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

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
