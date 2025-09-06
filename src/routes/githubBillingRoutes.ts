import { Router } from 'express';
import { GitHubBillingController } from '../controllers/githubBillingController';
import { authenticateToken } from '../middleware/authenticateToken';
import { authenticateAdmin } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// 速率限制配置
const billingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP每15分钟最多100次请求
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
});

const configLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1小时
    max: 10, // 每个IP每小时最多10次配置更新
    message: { error: '配置更新过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
});

// 应用速率限制到所有路由
router.use(billingLimiter);

// 配置管理路由（需要管理员权限）
router.post('/config', configLimiter, authenticateToken, authenticateAdmin, GitHubBillingController.saveCurlConfig);
router.get('/config', authenticateToken, authenticateAdmin, GitHubBillingController.getCurlConfig);

// 测试解析路由（需要管理员权限，不保存配置）
router.post('/test-parse', configLimiter, authenticateToken, authenticateAdmin, GitHubBillingController.testParseCurl);

// 数据获取路由（公开访问）
router.get('/usage', GitHubBillingController.getBillingUsage);

// 缓存管理路由（需要管理员权限）
router.delete('/cache/:customerId', authenticateToken, authenticateAdmin, GitHubBillingController.clearCache);
router.delete('/cache/expired', authenticateToken, authenticateAdmin, GitHubBillingController.clearExpiredCache);

// 客户列表路由（需要管理员权限）
router.get('/customers', authenticateToken, authenticateAdmin, GitHubBillingController.getCachedCustomers);

export default router;
