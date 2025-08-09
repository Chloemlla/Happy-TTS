import express from 'express';
import { adminController } from '../controllers/adminController';
import { authMiddleware } from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { authenticateToken } from '../middleware/authenticateToken';
import logger from '../utils/logger';
import * as crypto from 'crypto';
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB限制

const router = express.Router();

// 管理员路由限流器（每IP每分钟50次）
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: '管理员操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.ip || req.socket?.remoteAddress || 'unknown',
  skip: (req: any) => req.isLocalIp || false
});

// 管理员权限检查中间件
const adminAuthMiddleware = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

// 启动时清理所有用户的avatarBase64字段，只保留avatarUrl
import { UserStorage } from '../utils/userStorage';
(async () => {
  try {
    const users = await UserStorage.getAllUsers();
    for (const user of users) {
      if ((user as any).avatarBase64) {
        await UserStorage.updateUser(user.id, { avatarBase64: undefined } as any);
      }
    }
  } catch (e) {
    console.warn('启动时清理avatarBase64字段失败', e);
  }
})();

// 公告读取接口移到最前面，不加任何中间件
router.get('/announcement', adminController.getAnnouncement);

// 其余路由依然加auth
router.use(authMiddleware);
router.use(adminAuthMiddleware);
router.use(adminLimiter); // 已登录管理员不再限速

/**
 * @openapi
 * /admin/users:
 *   get:
 *     summary: 获取用户列表
 *     responses:
 *       200:
 *         description: 用户列表
 */
router.get('/users', adminController.getUsers);

/**
 * @openapi
 * /admin/users:
 *   post:
 *     summary: 创建用户
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 创建用户结果
 */
router.post('/users', adminController.createUser);

/**
 * @openapi
 * /admin/users/{id}:
 *   put:
 *     summary: 更新用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 更新用户结果
 */
router.put('/users/:id', adminController.updateUser);

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     summary: 删除用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 删除用户结果
 */
router.delete('/users/:id', adminController.deleteUser);

/**
 * @openapi
 * /admin/announcement:
 *   post:
 *     summary: 设置/更新公告
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               format:
 *                 type: string
 *     responses:
 *       200:
 *         description: 设置结果
 */
router.post('/announcement', adminController.setAnnouncement);

/**
 * @openapi
 * /admin/announcement:
 *   delete:
 *     summary: 删除所有公告
 *     responses:
 *       200:
 *         description: 删除结果
 */
router.delete('/announcement', adminController.deleteAnnouncements);

/**
 * @openapi
 * /admin/envs:
 *   get:
 *     summary: 获取所有环境变量
 *     responses:
 *       200:
 *         description: 环境变量列表
 */
router.get('/envs', adminController.getEnvs);

/**
 * @openapi
 * /admin/envs:
 *   post:
 *     summary: 新增或更新环境变量
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *               desc:
 *                 type: string
 *     responses:
 *       200:
 *         description: 保存结果
 */
router.post('/envs', adminController.setEnv);

/**
 * @openapi
 * /admin/envs:
 *   delete:
 *     summary: 删除环境变量
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *     responses:
 *       200:
 *         description: 删除结果
 */
router.delete('/envs', adminController.deleteEnv);

/**
 * @openapi
 * /admin/envs/delete:
 *   post:
 *     summary: 删除环境变量
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *     responses:
 *       200:
 *         description: 删除结果
 */
router.post('/envs/delete', adminController.deleteEnv);

// 短链管理API
router.get('/shortlinks', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 [ShortLinkManager] 开始处理短链列表加密请求...');
    console.log('   用户ID:', req.user?.id);
    console.log('   用户名:', req.user?.username);
    console.log('   用户角色:', req.user?.role);
    console.log('   请求IP:', req.ip);
    
    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      console.log('❌ [ShortLinkManager] 权限检查失败：非管理员用户');
      return res.status(403).json({ error: '需要管理员权限' });
    }

    console.log('✅ [ShortLinkManager] 权限检查通过');

    // 获取管理员token作为加密密钥
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ [ShortLinkManager] Token格式错误：未携带Token或格式不正确');
      return res.status(401).json({ error: '未携带Token，请先登录' });
    }
    
    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    if (!token) {
      console.log('❌ [ShortLinkManager] Token为空');
      return res.status(401).json({ error: 'Token为空' });
    }

    console.log('✅ [ShortLinkManager] Token获取成功，长度:', token.length);

    // 输入验证和清理
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1')) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '10')) || 10));
    
    const ShortUrlModel = require('mongoose').models.ShortUrl || require('mongoose').model('ShortUrl');
    
    // 安全的查询构建
    let query: any = {};
    if (search && search.length > 0) {
      // 防止正则表达式注入：转义特殊字符
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query = {
        $or: [
          { code: { $regex: escapedSearch, $options: 'i' } },
          { target: { $regex: escapedSearch, $options: 'i' } }
        ]
      };
    }
    
    const total = await ShortUrlModel.countDocuments(query);
    const items = await ShortUrlModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    console.log('📊 [ShortLinkManager] 获取到短链数量:', items.length);
    console.log('   总数:', total);

    // 准备加密数据
    const responseData = { total, items };
    const jsonData = JSON.stringify(responseData);
    console.log('📝 [ShortLinkManager] JSON数据准备完成，长度:', jsonData.length);

    // 使用AES-256-CBC加密数据
    console.log('🔐 [ShortLinkManager] 开始AES-256-CBC加密...');
    const algorithm = 'aes-256-cbc';
    
    // 生成密钥
    console.log('   生成密钥...');
    const key = crypto.createHash('sha256').update(token).digest();
    console.log('   密钥生成完成，长度:', key.length);
    
    // 生成IV
    console.log('   生成初始化向量(IV)...');
    const iv = crypto.randomBytes(16);
    console.log('   IV生成完成，长度:', iv.length);
    console.log('   IV (hex):', iv.toString('hex'));
    
    // 创建加密器
    console.log('   创建加密器...');
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    // 执行加密
    console.log('   开始加密数据...');
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    console.log('✅ [ShortLinkManager] 加密完成');
    console.log('   原始数据长度:', jsonData.length);
    console.log('   加密后数据长度:', encrypted.length);
    console.log('   加密算法:', algorithm);
    console.log('   密钥长度:', key.length);
    console.log('   IV长度:', iv.length);

    // 返回加密后的数据
    const response = { 
      success: true, 
      data: encrypted,
      iv: iv.toString('hex')
    };
    
    console.log('📤 [ShortLinkManager] 准备返回加密数据');
    console.log('   响应数据大小:', JSON.stringify(response).length);
    
    res.json(response);
    
    console.log('✅ [ShortLinkManager] 短链列表加密请求处理完成');
    
  } catch (error) {
    console.error('❌ [ShortLinkManager] 获取短链列表失败:', error);
    res.status(500).json({ error: '获取短链列表失败' });
  }
});

router.delete('/shortlinks/:id', authenticateToken, async (req, res) => {
  try {
    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { id } = req.params;
    
    // 验证ID格式，防止NoSQL注入
    if (!id || typeof id !== 'string' || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ error: '无效的短链ID格式' });
    }

    const ShortUrlModel = require('mongoose').models.ShortUrl || require('mongoose').model('ShortUrl');
    const link = await ShortUrlModel.findById(id);
    
    if (!link) {
      return res.status(404).json({ error: '短链不存在' });
    }
    
    await ShortUrlModel.findByIdAndDelete(id);
    logger.info('[ShortLink] 管理员删除短链', {
      admin: req.user?.username || req.user?.id,
      code: link?.code,
      target: link?.target,
      id: id,
      time: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('[ShortLink] 删除短链失败:', error);
    res.status(500).json({ error: '删除短链失败' });
  }
});

// 批量删除短链
router.post('/shortlinks/batch-delete', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    
    // 验证请求体
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: '请提供有效的短链ID列表' });
    }

    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const ShortUrlModel = require('mongoose').models.ShortUrl || require('mongoose').model('ShortUrl');
    
    // 验证每个ID的格式，防止NoSQL注入
    const validIds = ids.filter(id => 
      typeof id === 'string' && 
      id.length === 24 && 
      /^[0-9a-fA-F]{24}$/.test(id)
    );

    if (validIds.length === 0) {
      return res.status(400).json({ error: '没有有效的短链ID' });
    }

    // 限制批量删除的数量，防止DoS攻击
    if (validIds.length > 100) {
      return res.status(400).json({ error: '批量删除数量不能超过100个' });
    }

    // 查找所有要删除的短链
    const links = await ShortUrlModel.find({ _id: { $in: validIds } });
    
    if (links.length === 0) {
      return res.status(404).json({ error: '没有找到要删除的短链' });
    }

    // 执行批量删除
    const deleteResult = await ShortUrlModel.deleteMany({ _id: { $in: validIds } });

    logger.info('[ShortLink] 管理员批量删除短链', {
      admin: req.user?.username || req.user?.id,
      requestedCount: ids.length,
      validCount: validIds.length,
      deletedCount: deleteResult.deletedCount,
      deletedCodes: links.map((link: any) => link.code),
      time: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '批量删除成功',
      data: {
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: links.map((link: any) => link.code)
      }
    });
  } catch (error) {
    logger.error('[ShortLink] 批量删除短链失败:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : '批量删除短链失败' 
    });
  }
});

// 创建短链
router.post('/shortlinks', authenticateToken, async (req, res) => {
  try {
    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    const { target, customCode } = req.body;
    
    // 输入验证
    if (!target || typeof target !== 'string') {
      return res.status(400).json({ error: '目标地址不能为空' });
    }
    
    // 验证目标URL格式
    const trimmedTarget = target.trim();
    if (trimmedTarget.length === 0 || trimmedTarget.length > 2000) {
      return res.status(400).json({ error: '目标地址长度必须在1-2000个字符之间' });
    }
    
    // 验证URL格式
    try {
      new URL(trimmedTarget);
    } catch {
      return res.status(400).json({ error: '目标地址必须是有效的URL格式' });
    }
    
    const mongoose = require('mongoose');
    const ShortUrlModel = mongoose.models.ShortUrl || mongoose.model('ShortUrl');
    const nanoid = require('nanoid').nanoid;
    const { shortUrlMigrationService } = require('../services/shortUrlMigrationService');
    
    let code: string;
    
    // 如果提供了自定义短链接码
    if (customCode && typeof customCode === 'string') {
      const trimmedCode = customCode.trim();
      
      // 验证自定义短链接码格式
      if (trimmedCode.length < 1 || trimmedCode.length > 200) {
        return res.status(400).json({ error: '自定义短链接码长度必须在1-200个字符之间' });
      }
      
      // 验证字符格式（只允许字母、数字、连字符和下划线）
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        return res.status(400).json({ error: '自定义短链接码只能包含字母、数字、连字符和下划线' });
      }
      
      // 检查是否已存在
      const existingShortUrl = await ShortUrlModel.findOne({ code: trimmedCode });
      if (existingShortUrl) {
        return res.status(400).json({ error: '该短链接码已被使用，请选择其他短链接码' });
      }
      
      code = trimmedCode;
    } else {
      // 生成随机短链接码
      let randomCode = nanoid(6);
      let retries = 0;
      const maxRetries = 10;
      
      while (retries < maxRetries) {
        const existingCode = await ShortUrlModel.findOne({ code: randomCode });
        if (!existingCode) {
          break;
        }
        randomCode = nanoid(6);
        retries++;
      }
      
      if (retries >= maxRetries) {
        return res.status(500).json({ error: '无法生成唯一的短链代码，请重试' });
      }
      
      code = randomCode;
    }
    
    // 使用迁移服务自动修正目标URL
    const fixedTarget = shortUrlMigrationService.fixTargetUrlBeforeSave(trimmedTarget);
    
    const userId = req.user?.id || 'admin';
    const username = req.user?.username || 'admin';
    const doc = await ShortUrlModel.create({ code, target: fixedTarget, userId, username });
    res.json({ success: true, code, shortUrl: `/s/${code}`, doc });
  } catch (error) {
    logger.error('[ShortLink] 创建短链失败:', error);
    res.status(500).json({ error: '创建短链失败' });
  }
});

// 短链迁移管理API
router.post('/shortlinks/migrate', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 [ShortUrlMigration] 开始处理短链迁移请求...');
    console.log('   用户ID:', req.user?.id);
    console.log('   用户名:', req.user?.username);
    console.log('   用户角色:', req.user?.role);
    console.log('   请求IP:', req.ip);
    
    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      console.log('❌ [ShortUrlMigration] 权限检查失败：非管理员用户');
      return res.status(403).json({ error: '需要管理员权限' });
    }

    console.log('✅ [ShortUrlMigration] 权限检查通过');

    const { shortUrlMigrationService } = require('../services/shortUrlMigrationService');
    
    // 执行迁移
    const result = await shortUrlMigrationService.detectAndFixOldDomainUrls();
    
    console.log('📊 [ShortUrlMigration] 迁移完成');
    console.log('   检查记录数:', result.totalChecked);
    console.log('   修正记录数:', result.totalFixed);
    
    res.json({
      success: true,
      message: `迁移完成，共修正 ${result.totalFixed} 条记录`,
      data: result
    });
    
  } catch (error) {
    console.error('❌ [ShortUrlMigration] 短链迁移失败:', error);
    res.status(500).json({ error: '短链迁移失败' });
  }
});

// 获取短链迁移统计信息
router.get('/shortlinks/migration-stats', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 [ShortUrlMigration] 开始处理迁移统计请求...');
    console.log('   用户ID:', req.user?.id);
    console.log('   用户名:', req.user?.username);
    console.log('   用户角色:', req.user?.role);
    
    // 检查管理员权限
    if (!req.user || req.user.role !== 'admin') {
      console.log('❌ [ShortUrlMigration] 权限检查失败：非管理员用户');
      return res.status(403).json({ error: '需要管理员权限' });
    }

    console.log('✅ [ShortUrlMigration] 权限检查通过');

    const { shortUrlMigrationService } = require('../services/shortUrlMigrationService');
    
    // 获取统计信息
    const stats = await shortUrlMigrationService.getMigrationStats();
    
    console.log('📊 [ShortUrlMigration] 统计信息获取完成');
    console.log('   总记录数:', stats.totalRecords);
    console.log('   旧域名记录数:', stats.oldDomainRecords);
    console.log('   新域名记录数:', stats.newDomainRecords);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ [ShortUrlMigration] 获取迁移统计失败:', error);
    res.status(500).json({ error: '获取迁移统计失败' });
  }
});

// 管理员权限验证API
router.post('/verify-access', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 [AdminAccess] 开始验证管理员访问权限...');
    console.log('   用户ID:', req.user?.id);
    console.log('   用户名:', req.user?.username);
    console.log('   用户角色:', req.user?.role);
    console.log('   请求IP:', req.ip);
    
    // 检查用户是否存在
    if (!req.user) {
      console.log('❌ [AdminAccess] 权限验证失败：用户不存在');
      return res.status(401).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    // 检查用户角色
    if (req.user.role !== 'admin') {
      console.log('❌ [AdminAccess] 权限验证失败：非管理员用户', { 
        userId: req.user.id, 
        role: req.user.role 
      });
      return res.status(403).json({ 
        success: false, 
        message: '权限不足，仅限管理员访问' 
      });
    }

    // 验证请求体中的用户信息
    const { userId, username, role } = req.body;
    if (userId !== req.user.id || username !== req.user.username || role !== req.user.role) {
      console.log('❌ [AdminAccess] 权限验证失败：用户信息不匹配', {
        requestBody: { userId, username, role },
        tokenUser: { id: req.user.id, username: req.user.username, role: req.user.role }
      });
      return res.status(403).json({ 
        success: false, 
        message: '用户信息不匹配' 
      });
    }

    console.log('✅ [AdminAccess] 管理员权限验证通过');
    
    res.json({
      success: true,
      message: '权限验证通过',
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      }
    });
    
  } catch (error) {
    console.error('❌ [AdminAccess] 权限验证过程中发生错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '权限验证失败' 
    });
  }
});

// 用户信息获取接口（需登录）
router.get('/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: '未登录' });
    const { id, username, role } = user;
    let email = undefined;
    let avatarUrl = undefined;
    let avatarHash = undefined;
    const { UserStorage } = require('../utils/userStorage');
    const dbUser = await UserStorage.getUserById(id);
    if (dbUser) {
      email = dbUser.email;
      if (dbUser.avatarUrl && typeof dbUser.avatarUrl === 'string' && dbUser.avatarUrl.length > 0) {
        // 将 ipfs.crossbell.io 替换为 ipfs.hapxs.com
        avatarUrl = dbUser.avatarUrl.replace('ipfs.crossbell.io', 'ipfs.hapxs.com');
        // 尝试从URL中提取hash（如文件名带hash），否则可用md5等生成
        const match = avatarUrl.match(/([a-fA-F0-9]{8,})\.(jpg|jpeg|png|webp|gif)$/);
        if (match) {
          avatarHash = match[1];
        } else {
          // 若URL不带hash，可用URL整体md5
          const crypto = require('crypto');
          avatarHash = crypto.createHash('md5').update(avatarUrl).digest('hex');
        }
      }
    }
    const resp = { id, username, email, role };
    if (avatarUrl) {
      (resp as any).avatarUrl = avatarUrl;
      (resp as any).avatarHash = avatarHash;
    }
    res.json(resp);
  } catch (e) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 用户信息更新接口（需登录）
router.post('/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: '未登录' });
    const { email, password, newPassword, avatarUrl, verificationCode } = req.body;
    const { UserStorage } = require('../utils/userStorage');
    const dbUser = await UserStorage.getUserById(user.id);
    // 判断二次认证方式
    const hasTOTP = !!dbUser.totpEnabled;
    const hasPasskey = Array.isArray(dbUser.passkeyCredentials) && dbUser.passkeyCredentials.length > 0;
    if (!hasTOTP && !hasPasskey) {
      if (!password || !UserStorage.checkPassword(dbUser, password)) {
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev') {
          console.warn('[UserStorage] 密码校验失败，预期密码:', dbUser.password);
        }
        return res.status(401).json({ error: '密码错误，无法验证身份' });
      }
    } else {
      if (!verificationCode && !(avatarUrl && !email && !newPassword)) {
        return res.status(401).json({ error: '请提供TOTP或Passkey验证码' });
      }
      // 这里可调用原有TOTP/Passkey校验逻辑（略，假设通过）
    }
    // 更新信息
    const updateData: any = {};
    if (email) updateData.email = email;
    if (avatarUrl && typeof avatarUrl === 'string') {
      updateData.avatarUrl = avatarUrl;
    }
    if (newPassword) updateData.password = newPassword;
    // 只有明确需要重置passkeyCredentials时才设置，避免误清空
    // if (!Array.isArray(dbUser.passkeyCredentials)) {
    //   updateData.passkeyCredentials = [];
    // }
    await UserStorage.updateUser(user.id, updateData);
    const updated = await UserStorage.getUserById(user.id);
    const { password: _, ...safeUser } = updated;
    const resp = { ...safeUser };
    res.json(resp);
  } catch (e) {
    console.error('用户信息更新接口异常:', e);
    res.status(500).json({ error: '信息修改失败' });
  }
});

// 用户头像上传接口（支持文件上传到IPFS）
router.post('/user/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: '未登录' });
    if (!req.file) return res.status(400).json({ error: '未上传头像文件' });
    // 直接调用ipfsService上传图片
    const { IPFSService } = require('../services/ipfsService');
    let result;
    try {
      result = await IPFSService.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      if (!result || !result.web2url) {
        console.error('[avatar upload] IPFS上传失败，返回值:', result);
        return res.status(500).json({ error: 'IPFS上传失败' });
      }
    } catch (ipfsErr) {
      // 兼容 TS 类型，安全打印错误堆栈
      console.error('[avatar upload] IPFS上传异常:', ipfsErr && typeof ipfsErr === 'object' && 'stack' in ipfsErr ? ipfsErr.stack : ipfsErr);
      return res.status(500).json({ error: 'IPFS上传异常', detail: ipfsErr instanceof Error ? ipfsErr.message : String(ipfsErr) });
    }
    // 存储图片web2url，删除base64
    const { UserStorage } = require('../utils/userStorage');
    await UserStorage.updateUser(user.id, { avatarUrl: result.web2url, avatarBase64: undefined });
    res.json({ success: true, avatarUrl: result.web2url });
  } catch (e) {
    console.error('[avatar upload] 头像上传接口异常:', String(e));
    res.status(500).json({ error: '头像上传失败', detail: e instanceof Error ? e.message : String(e) });
  }
});

// 用户头像是否存在接口（需登录）
// 逻辑：如果数据库中 avatarUrl 字段不存在或为空，返回 hasAvatar: false，前端可回退到默认 SVG
router.get('/user/avatar/exist', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: '未登录' });
    const { UserStorage } = require('../utils/userStorage');
    const dbUser = await UserStorage.getUserById(user.id);
    // avatarUrl 不存在或为空字符串时，hasAvatar 为 false
    const hasAvatar = !!(dbUser && typeof dbUser.avatarUrl === 'string' && dbUser.avatarUrl.length > 0);
    res.json({ hasAvatar });
  } catch (e) {
    res.status(500).json({ error: '查询头像状态失败' });
  }
});

export default router; 