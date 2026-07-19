import { type Request, type Response, Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { firstString } from "../utils/httpParam";
import {
  createApiKey,
  deleteKey,
  enableKey,
  getApiKeyPermissionDefinitions,
  listAllKeys,
  listUserKeys,
  normalizeApiKeyPermissions,
  revokeKey,
  updateKey,
} from "../services/apiKeyService";
import { adjustApiKeyBalance, listApiKeyBillingEvents } from "../services/apiKeyBillingService";
import { createLimiter } from "../middleware/routeLimiters";
import logger from "../utils/logger";

const router = Router();
const apiKeyManagementLimiter = createLimiter({
  name: "apikey-management",
  profile: "sensitive",
  category: "auth",
  message: "API Key 管理请求过于频繁，请稍后再试",
});

async function findVisibleKey(user: any, keyId: string) {
  const keys = user.role === "admin" ? await listAllKeys() : await listUserKeys(user.id);
  return keys.find((key) => key.keyId === keyId) || null;
}

// 所有路由都需要 JWT 认证
router.use(authMiddleware);
router.use(apiKeyManagementLimiter);

/** 获取可用权限列表 */
router.get("/permissions", (req: Request, res: Response) => {
  const user = (req as any).user;
  const permissionDetails = getApiKeyPermissionDefinitions(user?.role === "admin");
  res.json({
    success: true,
    permissions: permissionDetails.map((permission) => permission.key),
    permissionDetails,
  });
});

/** 获取 API Key 计费价格表 */
router.get("/billing/rates", (req: Request, res: Response) => {
  const user = (req as any).user;
  const rates = getApiKeyPermissionDefinitions(user?.role === "admin").map((permission) => ({
    permission: permission.key,
    label: permission.label,
    costCredits: permission.costCredits,
    description: permission.description,
  }));
  res.json({ success: true, unit: "credits", billableStatus: "2xx-3xx", rates });
});

/** 创建 API Key（任何已登录用户） */
router.post("/", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, permissions, rateLimit, expiresInDays, billingMode, billingEnabled, balanceCredits } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 50) {
      return res.status(400).json({ error: "名称不能为空且不超过50字符" });
    }

    const isAdmin = user.role === "admin";
    const perms = normalizeApiKeyPermissions(permissions, { isAdmin });

    const result = await createApiKey({
      name: name.trim(),
      userId: user.id,
      permissions: perms,
      rateLimit: Math.min(Math.max(Number(rateLimit) || 60, 1), 1000),
      expiresInDays: expiresInDays != null ? Math.min(Math.max(Number(expiresInDays), 1), 365) : null,
      isAdmin,
      billingEnabled: isAdmin && billingEnabled !== undefined ? !!billingEnabled : true,
      billingMode: isAdmin && billingMode === "prepaid" ? "prepaid" : "metered",
      balanceCredits: isAdmin ? Math.min(Math.max(Number(balanceCredits) || 0, 0), 1_000_000) : 0,
    });

    return res.json({ success: true, ...result, message: "请妥善保存此密钥，它不会再次显示" });
  } catch (err) {
    logger.error("[ApiKey] 创建失败", err);
    return res.status(500).json({ error: "创建 API Key 失败" });
  }
});

/** 列出当前用户的 Key */
router.get("/mine", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keys = await listUserKeys(user.id);
    return res.json({ success: true, keys });
  } catch (err) {
    logger.error("[ApiKey] 列出失败", err);
    return res.status(500).json({ error: "获取 API Key 列表失败" });
  }
});

/** 列出所有 Key（管理员） */
router.get("/all", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
    const keys = await listAllKeys();
    return res.json({ success: true, keys });
  } catch (err) {
    logger.error("[ApiKey] 列出全部失败", err);
    return res.status(500).json({ error: "获取失败" });
  }
});

/** 列出 Key 的计费流水（所有者或管理员） */
router.get("/:keyId/billing/events", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keyId = firstString(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "无效的 Key ID" });
    const target = await findVisibleKey(user, keyId);
    if (!target) return res.status(404).json({ error: "API Key 不存在" });

    const events = await listApiKeyBillingEvents({
      keyId,
      limit: Number(req.query.limit) || 20,
    });
    return res.json({ success: true, events });
  } catch (err) {
    logger.error("[ApiKey] 获取计费流水失败", err);
    return res.status(500).json({ error: "获取计费流水失败" });
  }
});

/** 调整 Key 余额（管理员） */
router.post("/:keyId/billing/adjust", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });

    const keyId = firstString(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "无效的 Key ID" });
    const target = await findVisibleKey(user, keyId);
    if (!target) return res.status(404).json({ error: "API Key 不存在" });

    const result = await adjustApiKeyBalance({
      keyId,
      credits: Number(req.body?.credits),
      reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
      actorUserId: user.id,
      requestId: req.requestId,
    });
    if (!result) return res.status(400).json({ error: "余额不足或 API Key 不存在" });

    return res.json({ success: true, balanceCredits: result.balanceCredits });
  } catch (err) {
    const statusCode = typeof (err as any)?.statusCode === "number" ? (err as any).statusCode : 500;
    logger.error("[ApiKey] 调整余额失败", err);
    return res.status(statusCode).json({ error: err instanceof Error ? err.message : "调整余额失败" });
  }
});

/** 更新 Key（所有者或管理员） */
router.put("/:keyId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keyId = firstString(req.params.keyId);
    const { name, permissions, rateLimit, enabled, expiresInDays, billingEnabled, billingMode } = req.body;
    if (!keyId) return res.status(400).json({ error: "无效的 Key ID" });

    // 先查找确认所有权
    const isAdmin = user.role === "admin";
    const target = await findVisibleKey(user, keyId);
    if (!target) return res.status(404).json({ error: "API Key 不存在" });

    const updates: any = {};
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName || trimmedName.length > 50) {
        return res.status(400).json({ error: "名称不能为空且不超过50字符" });
      }
      updates.name = trimmedName;
    }
    if (permissions !== undefined) {
      updates.permissions = normalizeApiKeyPermissions(permissions, {
        isAdmin,
        fallback: target.permissions,
      });
    }
    if (rateLimit !== undefined) updates.rateLimit = Math.min(Math.max(Number(rateLimit) || 60, 1), 1000);
    if (enabled !== undefined) updates.enabled = !!enabled;
    if (isAdmin && billingEnabled !== undefined) updates.billingEnabled = !!billingEnabled;
    if (isAdmin && billingMode !== undefined) {
      if (billingMode !== "metered" && billingMode !== "prepaid") {
        return res.status(400).json({ error: "无效的计费模式" });
      }
      updates.billingMode = billingMode;
    }
    if (expiresInDays !== undefined) {
      updates.expiresAt =
        expiresInDays == null || expiresInDays === ""
          ? null
          : new Date(Date.now() + Math.min(Math.max(Number(expiresInDays), 1), 365) * 86400000);
    }

    const updated = await updateKey(keyId, updates);
    return res.json({ success: true, key: updated });
  } catch (err) {
    logger.error("[ApiKey] 更新失败", err);
    return res.status(500).json({ error: "更新失败" });
  }
});

/** 吊销 Key */
router.post("/:keyId/revoke", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keyId = firstString(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "无效的 Key ID" });
    const allKeys = user.role === "admin" ? await listAllKeys() : await listUserKeys(user.id);
    if (!allKeys.find((k) => k.keyId === keyId)) return res.status(404).json({ error: "API Key 不存在" });

    await revokeKey(keyId);
    return res.json({ success: true, message: "已吊销" });
  } catch (err) {
    logger.error("[ApiKey] 吊销失败", err);
    return res.status(500).json({ error: "吊销失败" });
  }
});

/** 启用 Key */
router.post("/:keyId/enable", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keyId = firstString(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "无效的 Key ID" });
    const allKeys = user.role === "admin" ? await listAllKeys() : await listUserKeys(user.id);
    if (!allKeys.find((k) => k.keyId === keyId)) return res.status(404).json({ error: "API Key 不存在" });

    await enableKey(keyId);
    return res.json({ success: true, message: "已启用" });
  } catch (err) {
    logger.error("[ApiKey] 启用失败", err);
    return res.status(500).json({ error: "启用失败" });
  }
});

/** 删除 Key（永久） */
router.delete("/:keyId", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const keyId = firstString(req.params.keyId);
    if (!keyId) return res.status(400).json({ error: "无效的 Key ID" });
    const allKeys = user.role === "admin" ? await listAllKeys() : await listUserKeys(user.id);
    if (!allKeys.find((k) => k.keyId === keyId)) return res.status(404).json({ error: "API Key 不存在" });

    await deleteKey(keyId);
    return res.json({ success: true, message: "已永久删除" });
  } catch (err) {
    logger.error("[ApiKey] 删除失败", err);
    return res.status(500).json({ error: "删除失败" });
  }
});

export default router;
