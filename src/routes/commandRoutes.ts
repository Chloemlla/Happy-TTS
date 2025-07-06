import { Router } from 'express';
import { commandService } from '../services/commandService';
import { config } from '../config/config';

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

/**
 * @openapi
 * /command/execute:
 *   post:
 *     summary: 执行命令
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [command, password]
 *             properties:
 *               command:
 *                 type: string
 *                 description: 要执行的命令
 *               password:
 *                 type: string
 *                 description: 管理员密码
 *     responses:
 *       200:
 *         description: 命令执行成功
 *       400:
 *         description: 危险命令被拒绝
 *       403:
 *         description: 密码错误
 *       500:
 *         description: 命令执行失败
 */
router.post('/execute', async (req, res) => {
  try {
    const { command, password } = req.body;

    // 验证密码
    if (password !== config.adminPassword) {
      return res.status(403).json({ error: '密码错误' });
    }

    // 检查危险命令
    const dangerousCommands = [
      'rm -rf /',
      'rm -rf /*',
      'format c:',
      'del /s /q c:\\',
      'sudo rm -rf /',
      'dd if=/dev/zero of=/dev/sda',
      'mkfs.ext4 /dev/sda1'
    ];

    if (dangerousCommands.some(cmd => command.includes(cmd))) {
      return res.status(400).json({ error: '危险命令被拒绝' });
    }

    // 执行命令
    const output = await commandService.executeCommand(command);
    res.json({ output });
  } catch (error) {
    console.error('命令执行错误:', error);
    res.status(500).json({ error: '命令执行失败' });
  }
});

/**
 * @openapi
 * /command/status:
 *   post:
 *     summary: 获取服务器状态
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 description: 管理员密码
 *     responses:
 *       200:
 *         description: 服务器状态信息
 *       403:
 *         description: 密码错误
 */
router.post('/status', (req, res) => {
  try {
    const { password } = req.body;

    // 验证密码
    if (password !== config.adminPassword) {
      return res.status(403).json({ error: '密码错误' });
    }

    // 获取服务器状态
    const status = commandService.getServerStatus();
    res.json(status);
  } catch (error) {
    console.error('获取状态错误:', error);
    res.status(500).json({ error: '获取服务器状态失败' });
  }
});

export default router; 