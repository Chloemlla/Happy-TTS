import { Router } from "express";
import { GitHubBillingController } from "../controllers/githubBillingController";
import { authenticateAdmin, authenticateSuperAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { createLimiter, githubBillingLimiter } from "../middleware/routeLimiters";

// 开发环境下的管理员认证中间件（跳过Turnstile验证）
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
router.post("/config", configLimiter, ...devSuperAdminAuth, GitHubBillingController.saveCurlConfig);
router.get("/config", ...devAdminAuth, GitHubBillingController.getCurlConfig);

// 多配置管理路由
router.post("/multi-config/:configKey", configLimiter, ...devSuperAdminAuth, GitHubBillingController.saveMultiCurlConfig);
router.get("/multi-config", ...devAdminAuth, GitHubBillingController.getMultiCurlConfig);
router.delete(
  "/multi-config/:configKey",
  configLimiter,
  ...devSuperAdminAuth,
  GitHubBillingController.deleteMultiCurlConfig,
);

// 测试解析路由（开发环境下不需要Turnstile验证）
router.post("/test-parse", configLimiter, ...devSuperAdminAuth, GitHubBillingController.testParseCurl);

// 数据获取路由（开发环境下跳过Turnstile验证）
const usageAuth: any[] = [];
router.get("/usage", ...usageAuth, GitHubBillingController.getBillingUsage);

// 聚合数据获取路由
router.get("/aggregated-usage", ...usageAuth, GitHubBillingController.getAggregatedBillingUsage);

// 管理员缓存管理路由（开发环境下不需要Turnstile验证）
router.delete("/cache/:customerId", cacheLimiter, ...devSuperAdminAuth, GitHubBillingController.clearCache);
router.delete("/cache/expired", cacheLimiter, ...devSuperAdminAuth, GitHubBillingController.clearExpiredCache);
router.get("/cache/metrics", ...devAdminAuth, GitHubBillingController.getCacheMetrics);
router.get("/cache/customers", ...devAdminAuth, GitHubBillingController.getCachedCustomers);

// 客户列表路由（公开访问）
router.get("/customers", GitHubBillingController.getCachedCustomers);

export default router;
