import { Router } from "express";
import {
  batchDeleteCDKs,
  deleteAllCDKs,
  deleteCDK,
  deleteUnusedCDKs,
  exportCDKs,
  generateCDKs,
  getCDKStats,
  getCDKs,
  getTotalCDKCount,
  getUserRedeemedResources,
  importCDKs,
  redeemCDK,
  updateCDK,
} from "../controllers/cdkController";
import { auditLog } from "../middleware/auditLog";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter } from "../middleware/routeLimiters";

const router = Router();

// CDK 管理接口限速（在鉴权之前执行，避免未授权请求打到数据库）
const cdkAdminLimiter = createLimiter({
  name: "cdkAdmin",
  profile: "admin",
  category: "admin",
  message: "CDK 管理操作过于频繁，请稍后再试",
});

// CDK 兑换限速（公开入口，兑换前按 IP 限流）
const cdkRedeemLimiter = createLimiter({
  name: "cdkRedeem",
  profile: "sensitive",
  category: "public-api",
  message: "CDK 兑换过于频繁，请稍后再试",
});

// 公共API（兑换必须登录，身份与角色从 req.user 注入，避免 body 提权）
router.post(
  "/redeem",
  cdkRedeemLimiter,
  authenticateToken,
  auditLog({
    module: "cdk",
    action: "cdk.redeem",
    extractDetail: (req) => ({ code: req.body?.code }),
  }),
  redeemCDK,
);
// 已兑换资源列表必须登录且按 req.user.id 归属，防止越权拉取他人兑换记录。
router.get("/redeemed", authenticateToken, getUserRedeemedResources);

// 管理员API
router.get("/", cdkAdminLimiter, authenticateAdmin, getCDKs);
router.get("/stats", cdkAdminLimiter, authenticateAdmin, getCDKStats);
router.get("/total-count", cdkAdminLimiter, authenticateAdmin, getTotalCDKCount);
router.post(
  "/generate",
  cdkAdminLimiter,
  authenticateSuperAdmin,
  auditLog({
    module: "cdk",
    action: "cdk.generate",
    extractDetail: (req) => ({ resourceId: req.body.resourceId, count: req.body.count }),
  }),
  generateCDKs,
);
router.put(
  "/:id",
  cdkAdminLimiter,
  authenticateSuperAdmin,
  auditLog({ module: "cdk", action: "cdk.update", extractTarget: (req) => ({ targetId: req.params.id }) }),
  updateCDK,
);
router.delete("/all", cdkAdminLimiter, authenticateSuperAdmin, auditLog({ module: "cdk", action: "cdk.deleteAll" }), deleteAllCDKs);
router.delete("/unused", cdkAdminLimiter, authenticateSuperAdmin, auditLog({ module: "cdk", action: "cdk.deleteUnused" }), deleteUnusedCDKs);
router.delete(
  "/:id",
  cdkAdminLimiter,
  authenticateSuperAdmin,
  auditLog({ module: "cdk", action: "cdk.delete", extractTarget: (req) => ({ targetId: req.params.id }) }),
  deleteCDK,
);
router.post(
  "/batch-delete",
  cdkAdminLimiter,
  authenticateSuperAdmin,
  auditLog({ module: "cdk", action: "cdk.batchDelete", extractDetail: (req) => ({ count: req.body.ids?.length }) }),
  batchDeleteCDKs,
);
router.post("/ks/import", cdkAdminLimiter, authenticateSuperAdmin, auditLog({ module: "cdk", action: "cdk.import" }), importCDKs);
router.get("/export", cdkAdminLimiter, authenticateAdmin, exportCDKs);

export default router;
