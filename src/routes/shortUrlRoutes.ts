import { Router } from 'express';
import { ShortUrlController } from '../controllers/shortUrlController';
import { authMiddleware, adminAuthMiddleware } from '../middleware/authMiddleware';
import { createLimiter } from '../middleware/rateLimiter';
import { mongoose } from '../services/mongoService';
import rateLimit from 'express-rate-limit';

const router = Router();

// 速率限制器
const redirectLimiter = createLimiter({
	windowMs: 60 * 1000, // 1分钟
	max: 120,
	routeName: 'shorturl.redirect',
	message: '访问过于频繁，请稍后再试'
});

const userManageLimiter = createLimiter({
	windowMs: 60 * 1000, // 1分钟
	max: 30,
	routeName: 'shorturl.userManage',
	message: '操作过于频繁，请稍后再试'
});

const adminLimiter = createLimiter({
	windowMs: 5 * 60 * 1000, // 5分钟
	max: 50,
	routeName: 'shorturl.admin',
	message: '管理员操作过于频繁，请稍后再试'
});

// 额外严格的敏感接口限流（直接率限制器，便于静态规则检测）
const adminSensitiveLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: '操作过于频繁，请稍后再试' }
});

// 写操作专用更严格限流（提高 DoS 防护强度）
const adminWriteLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: '写入过于频繁，请稍后再试' }
});

// 用户短链管理（需要登录）
router.get('/shorturls', authMiddleware, userManageLimiter, ShortUrlController.getUserShortUrls);
router.delete('/shorturls/:code', authMiddleware, userManageLimiter, ShortUrlController.deleteShortUrl);
router.delete('/shorturls/batch', authMiddleware, userManageLimiter, ShortUrlController.batchDeleteShortUrls);

// 管理员功能：导出所有短链数据
router.get('/admin/export', authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.exportAllShortUrls);

// 管理员功能：删除所有短链数据
router.delete('/admin/deleteall', authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.deleteAllShortUrls);

// 管理员功能：导入短链数据
router.post('/admin/import', authMiddleware, adminAuthMiddleware, adminLimiter, ShortUrlController.importShortUrls);

// ========== 管理员功能：配置短链 AES_KEY（数据库优先，支持导入/导出加解密）===========
const ShortUrlSettingSchema = new mongoose.Schema({
	key: { type: String, default: 'AES_KEY' },
	value: { type: String, required: true },
	updatedAt: { type: Date, default: Date.now }
}, { collection: 'shorturl_settings' });
const ShortUrlSettingModel = mongoose.models.ShortUrlSetting || mongoose.model('ShortUrlSetting', ShortUrlSettingSchema);

// 获取 AES_KEY（脱敏显示）
router.get('/admin/aes-key', authMiddleware, adminAuthMiddleware, adminSensitiveLimiter, adminLimiter, async (req, res) => {
	try {
		if (mongoose.connection.readyState !== 1) {
			return res.json({ success: true, aesKey: null });
		}
		const doc: any = await ShortUrlSettingModel.findOne({ key: 'AES_KEY' }).lean();
		if (!doc || !doc.value) return res.json({ success: true, aesKey: null });
		const masked = doc.value.length > 8 ? (doc.value.slice(0, 2) + '***' + doc.value.slice(-4)) : '***';
		return res.json({ success: true, aesKey: masked, updatedAt: doc.updatedAt });
	} catch (e) {
		return res.status(500).json({ success: false, error: '获取 AES_KEY 失败' });
	}
});

// 设置/更新 AES_KEY
router.post('/admin/aes-key', authMiddleware, adminAuthMiddleware, adminSensitiveLimiter, adminWriteLimiter, adminLimiter, async (req, res) => {
	try {
		const { value } = req.body || {};
		if (typeof value !== 'string' || !value.trim() || value.length > 512) {
			return res.status(400).json({ success: false, error: '无效的 AES_KEY' });
		}
		const now = new Date();
		await ShortUrlSettingModel.findOneAndUpdate(
			{ key: 'AES_KEY' },
			{ value: value.trim(), updatedAt: now },
			{ upsert: true }
		);
		return res.json({ success: true });
	} catch (e) {
		return res.status(500).json({ success: false, error: '保存 AES_KEY 失败' });
	}
});

// 删除 AES_KEY（恢复为仅环境变量或无加密）
router.delete('/admin/aes-key', authMiddleware, adminAuthMiddleware, adminSensitiveLimiter, adminWriteLimiter, adminLimiter, async (req, res) => {
	try {
		await ShortUrlSettingModel.deleteOne({ key: 'AES_KEY' });
		return res.json({ success: true });
	} catch (e) {
		return res.status(500).json({ success: false, error: '删除 AES_KEY 失败' });
	}
});

// 短链重定向（公开访问）— 放到最后，避免覆盖 /admin 与 /shorturls 前缀
router.get('/:code', redirectLimiter, ShortUrlController.redirectToTarget);

export default router;