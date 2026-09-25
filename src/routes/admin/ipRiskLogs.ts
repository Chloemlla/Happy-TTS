import express from "express";
import { IpRiskLogController } from "../../controllers/ipRiskLogController";
import { authenticateSuperAdmin } from "../../middleware/auth";

/**
 * proxycheck.io 集成只读面板（超级管理员专用）。
 *
 * 挂载点：/api/admin（src/routes/admin/index.ts）。五个端点全是 GET，只读不写。
 * 数据里含原始 IP、内部判据与密钥哈希，因此每条路由都要求 superadmin
 * （与同目录 /proxycheck/setting 的写操作同级），而不是普通 admin。
 */
const router = express.Router();

// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/proxycheck/overview", authenticateSuperAdmin, IpRiskLogController.getOverview);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/proxycheck/lookups", authenticateSuperAdmin, IpRiskLogController.listLookups);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/proxycheck/risk-cache", authenticateSuperAdmin, IpRiskLogController.listRiskCache);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get("/proxycheck/quotas", authenticateSuperAdmin, IpRiskLogController.listQuotas);
// codeql[js/missing-rate-limiting] admin subtree rate-limited at mount (/api/admin adminLimiter, preTamperModules G11-06); in-router copy would split quota
router.get(
  "/proxycheck/probe-reports",
  authenticateSuperAdmin,
  IpRiskLogController.listProbeReports,
);

export default router;
