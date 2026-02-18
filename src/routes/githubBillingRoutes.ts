import { Router } from "express";
import rateLimit from "express-rate-limit";
import { GitHubBillingController } from "../controllers/githubBillingController";
import { authenticateAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { authenticateTurnstileToken, authenticateTurnstileTokenForAdmin } from "../middleware/turnstileAuth";

// 开发环境检测
const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

// 开发环境下的管理员认证中间件（跳过Turnstile验证）
const devAdminAuth = isDevelopment
  ? [authenticateToken, authenticateAdmin]
  : [authenticateToken, authenticateAdmin, authenticateTurnstileTokenForAdmin];

// 开发环境下的配置认证中间件
const devConfigAuth = isDevelopment ? [authenticateToken, authenticateAdmin] : [authenticateToken, authenticateAdmin];

const router = Router();

// 速率限制配置
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP每15分钟最多100次请求
  message: { error: "请求过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
});

const cacheLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 30, // 每个IP每分钟最多30次请求
  message: { error: "请求过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
});

const configLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 每个IP每小时最多10次配置更新
  message: { error: "配置更新过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 应用速率限制到所有路由
router.use(billingLimiter);

// 配置管理路由（开发环境下不需要Turnstile验证）
router.post("/config", configLimiter, ...devConfigAuth, GitHubBillingController.saveCurlConfig);
router.get("/config", ...devConfigAuth, GitHubBillingController.getCurlConfig);

// 多配置管理路由
router.post("/multi-config/:configKey", configLimiter, ...devConfigAuth, GitHubBillingController.saveMultiCurlConfig);
router.get("/multi-config", ...devConfigAuth, GitHubBillingController.getMultiCurlConfig);
router.delete(
  "/multi-config/:configKey",
  configLimiter,
  ...devConfigAuth,
  GitHubBillingController.deleteMultiCurlConfig,
);

// 测试解析路由（开发环境下不需要Turnstile验证）
router.post("/test-parse", configLimiter, ...devConfigAuth, GitHubBillingController.testParseCurl);

// 数据获取路由（开发环境下跳过Turnstile验证）
const usageAuth = isDevelopment ? [] : [authenticateTurnstileToken];
router.get("/usage", ...usageAuth, GitHubBillingController.getBillingUsage);

// 聚合数据获取路由
router.get("/aggregated-usage", ...usageAuth, GitHubBillingController.getAggregatedBillingUsage);

// 管理员缓存管理路由（开发环境下不需要Turnstile验证）
router.delete("/cache/:customerId", cacheLimiter, ...devAdminAuth, GitHubBillingController.clearCache);
router.delete("/cache/expired", cacheLimiter, ...devAdminAuth, GitHubBillingController.clearExpiredCache);
router.get("/cache/metrics", ...devAdminAuth, GitHubBillingController.getCacheMetrics);
router.get("/cache/customers", ...devAdminAuth, GitHubBillingController.getCachedCustomers);

// 客户列表路由（公开访问）
router.get("/customers", GitHubBillingController.getCachedCustomers);

export default router;
