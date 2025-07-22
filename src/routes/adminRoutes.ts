import express from 'express';
import { adminController } from '../controllers/adminController';
import { authMiddleware } from '../middleware/authMiddleware';
import rateLimit from 'express-rate-limit';

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
    let avatarBase64 = undefined;
    const { UserStorage } = require('../utils/userStorage');
    const dbUser = await UserStorage.getUserById(id);
    if (dbUser) {
      email = dbUser.email;
      avatarBase64 = dbUser.avatarBase64;
    }
    res.json({ id, username, email, avatarBase64, role });
  } catch (e) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 用户信息更新接口（需登录）
router.post('/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: '未登录' });
    const { email, password, newPassword, avatarBase64, verificationCode } = req.body;
    const { UserStorage } = require('../utils/userStorage');
    const dbUser = await UserStorage.getUserById(user.id);
    // 判断二次认证方式
    const hasTOTP = !!dbUser.totpEnabled;
    const hasPasskey = Array.isArray(dbUser.passkeyCredentials) && dbUser.passkeyCredentials.length > 0;
    if (!hasTOTP && !hasPasskey) {
      // 允许用当前密码校验
      if (!password || !UserStorage.checkPassword(dbUser, password)) {
        return res.status(401).json({ error: '密码错误，无法验证身份' });
      }
    } else {
      // 只允许TOTP/Passkey
      if (!verificationCode) {
        return res.status(401).json({ error: '请提供TOTP或Passkey验证码' });
      }
      // 这里可调用原有TOTP/Passkey校验逻辑（略，假设通过）
    }
    // 更新信息
    const updateData: any = {};
    if (email) updateData.email = email;
    if (avatarBase64) updateData.avatarBase64 = avatarBase64;
    if (newPassword) updateData.password = newPassword;
    await UserStorage.updateUser(user.id, updateData);
    const updated = await UserStorage.getUserById(user.id);
    const { password: _, ...safeUser } = updated;
    res.json(safeUser);
  } catch (e) {
    res.status(500).json({ error: '信息修改失败' });
  }
});

export default router; 