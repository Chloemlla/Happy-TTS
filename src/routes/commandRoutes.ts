import { Router } from 'express';
import { commandService } from '../services/commandService';

const router = Router();

/**
 * @openapi
 * /command/y:
 *   post:
 *     summary: 添加命令
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               command:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 添加命令结果
 */
router.post('/y', (req, res) => {
  const { command, password } = req.body;
  const result = commandService.addCommand(command as string, password as string);
  
  if (result.status === 'error') {
    return res.status(403).json(result);
  }
  
  return res.json(result);
});

/**
 * @openapi
 * /command/q:
 *   get:
 *     summary: 获取下一个命令
 *     responses:
 *       200:
 *         description: 下一个命令
 */
router.get('/q', (req, res) => {
  const result = commandService.getNextCommand();
  return res.json(result);
});

/**
 * @openapi
 * /command/p:
 *   post:
 *     summary: 移除命令
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               command:
 *                 type: string
 *     responses:
 *       200:
 *         description: 移除命令结果
 */
router.post('/p', (req, res) => {
  const { command } = req.body;
  const result = commandService.removeCommand(command);
  return res.json(result);
});

export default router; 