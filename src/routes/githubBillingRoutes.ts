import { Router } from "express";
import { GitHubBillingController } from "../controllers/githubBillingController";
import { auditLog } from "../middleware/auditLog";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter, githubBillingLimiter } from "../middleware/routeLimiters";

// 管理员认证中间件（用量/配置读取要求登录 + 管理员）
const devAdminAuth = [authenticateToken, authenticateAdmin];

// 配置/系统写操作的超级管理员认证中间件
const devSuperAdminAuth = [authenticateToken, authenticateSuperAdmin];

const router = Router();

// 速率限制配置（统一 routeLimiters）
const billingLimiter = githubBillingLimiter;

const cacheLimiter = createLimiter({
  name: "githubBillingCache",
  profile: "standard",
  category: "public-api",
  message: "请求过于频繁，请稍后再试",
});

const configLimiter = createLimiter({
  name: "githubBillingConfig",
  profile: "sensitive",
  category: "admin",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "配置更新过于频繁，请稍后再试",
});

// 应用速率限制到所有路由
router.use(billingLimiter);

// 配置管理路由（开发环境下不需要Turnstile验证）
router.post(
  "/config",
  configLimiter,
  ...devSuperAdminAuth,
  auditLog({ module: "config", action: "config.githubBilling.set", captureBody: false }),
  GitHubBillingController.saveCurlConfig,
);
router.get("/config", ...devAdminAuth, GitHubBillingController.getCurlConfig);

// 多配置管理路由
router.post(
  "/multi-config/:configKey",
  configLimiter,
  ...devSuperAdminAuth,
  auditLog({ module: "config", action: "config.githubBilling.multiSet", captureBody: false, extractDetail: (req) => ({ configKey: req.params.configKey }) }),
  GitHubBillingController.saveMultiCurlConfig,
);
router.get("/multi-config", ...devAdminAuth, GitHubBillingController.getMultiCurlConfig);
router.delete(
  "/multi-config/:configKey",
  configLimiter,
  ...devSuperAdminAuth,
  auditLog({ module: "config", action: "config.githubBilling.multiDelete", extractDetail: (req) => ({ configKey: req.params.configKey }) }),
  GitHubBillingController.deleteMultiCurlConfig,
);

// 测试解析路由（开发环境下不需要Turnstile验证）
router.post(
  "/test-parse",
  configLimiter,
  ...devSuperAdminAuth,
  auditLog({ module: "config", action: "config.githubBilling.testParse", captureBody: false }),
  GitHubBillingController.testParseCurl,
);

// 数据获取路由（用量数据属管理数据，要求登录 + 管理员）
const usageAuth = devAdminAuth;
router.get("/usage", ...usageAuth, GitHubBillingController.getBillingUsage);

// 聚合数据获取路由
router.get("/aggregated-usage", ...usageAuth, GitHubBillingController.getAggregatedBillingUsage);

// 管理员缓存管理路由
router.delete(
  "/cache/expired",
  cacheLimiter,
  ...devSuperAdminAuth,
  auditLog({ module: "config", action: "config.githubBilling.cacheClearExpired" }),
  GitHubBillingController.clearExpiredCache,
);
router.delete(
  "/cache/:customerId",
  cacheLimiter,
  ...devSuperAdminAuth,
  auditLog({ module: "config", action: "config.githubBilling.cacheClear", extractTarget: (req) => ({ targetId: req.params.customerId }) }),
  async (req, res, next) => {
    if (req.params.customerId === "expired") {
      return res.status(400).json({ error: "customerId 不能为保留字 expired" });
    }
    return GitHubBillingController.clearCache(req, res);
  },
);
router.get("/cache/metrics", ...devAdminAuth, GitHubBillingController.getCacheMetrics);
router.get("/cache/customers", ...devAdminAuth, GitHubBillingController.getCachedCustomers);

// 客户列表路由（历史公开路径：308 到带鉴权的 /cache/customers，不再复制一份无鉴权实现）
router.get("/customers", (_req, res) => {
  res.redirect(308, "/api/github-billing/cache/customers");
});

export default router;
