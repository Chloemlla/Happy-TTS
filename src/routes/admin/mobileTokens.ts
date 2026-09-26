import express from "express";
import { MobileTokenAdminController } from "../../controllers/mobileTokenAdminController";
import { authenticateSuperAdmin } from "../../middleware/auth";

/**
 * `sml_` 客户端登录令牌血缘的只读后台面板（超级管理员专用）。
 *
 * 挂载点：/api/admin（src/routes/admin/index.ts）。四个端点全是 GET，只读不写。
 * 数据含设备标识与来源 IP（已掩码）、令牌哈希（已掩码），因此每条路由都要求 superadmin，
 * 与同目录 /proxycheck/* 只读面板同级。
 */
const router = express.Router();

// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/mobile-token/overview", authenticateSuperAdmin, MobileTokenAdminController.getOverview);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/mobile-token/lineage", authenticateSuperAdmin, MobileTokenAdminController.listLineage);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/mobile-token/reuse", authenticateSuperAdmin, MobileTokenAdminController.listReuse);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/mobile-token/generations", authenticateSuperAdmin, MobileTokenAdminController.listGenerations);

export default router;
