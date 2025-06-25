import express from 'express';
import { adminController } from '../controllers/adminController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

router.use(authMiddleware); // 所有管理接口都需要管理员权限

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

export default router; 