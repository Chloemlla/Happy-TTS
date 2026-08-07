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

const router = Router();

// 公共API
router.post("/redeem", redeemCDK);
router.get("/redeemed", getUserRedeemedResources);

// 管理员API
router.get("/", authenticateAdmin, getCDKs);
router.get("/stats", authenticateAdmin, getCDKStats);
router.get("/total-count", authenticateAdmin, getTotalCDKCount);
router.post(
  "/generate",
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
  authenticateSuperAdmin,
  auditLog({ module: "cdk", action: "cdk.update", extractTarget: (req) => ({ targetId: req.params.id }) }),
  updateCDK,
);
router.delete("/all", authenticateSuperAdmin, auditLog({ module: "cdk", action: "cdk.deleteAll" }), deleteAllCDKs);
router.delete("/unused", authenticateSuperAdmin, auditLog({ module: "cdk", action: "cdk.deleteUnused" }), deleteUnusedCDKs);
router.delete(
  "/:id",
  authenticateSuperAdmin,
  auditLog({ module: "cdk", action: "cdk.delete", extractTarget: (req) => ({ targetId: req.params.id }) }),
  deleteCDK,
);
router.post(
  "/batch-delete",
  authenticateSuperAdmin,
  auditLog({ module: "cdk", action: "cdk.batchDelete", extractDetail: (req) => ({ count: req.body.ids?.length }) }),
  batchDeleteCDKs,
);
router.post("/ks/import", authenticateSuperAdmin, auditLog({ module: "cdk", action: "cdk.import" }), importCDKs);
router.get("/export", authenticateAdmin, exportCDKs);

export default router;
