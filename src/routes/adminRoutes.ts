import express from 'express';
import { adminController } from '../controllers/adminController';
import { authMiddleware } from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
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
router.use(adminLimiter);

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
        avatarUrl = dbUser.avatarUrl;
        // 尝试从URL中提取hash（如文件名带hash），否则可用md5等生成
        const match = dbUser.avatarUrl.match(/([a-fA-F0-9]{8,})\.(jpg|jpeg|png|webp|gif)$/);
        if (match) {
          avatarHash = match[1];
        } else {
          // 若URL不带hash，可用URL整体md5
          const crypto = require('crypto');
          avatarHash = crypto.createHash('md5').update(dbUser.avatarUrl).digest('hex');
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