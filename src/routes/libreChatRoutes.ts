import { Router } from 'express';
import { libreChatService } from '../services/libreChatService';

const router = Router();

/**
 * @openapi
 * /lc:
 *   get:
 *     summary: 获取最新镜像信息
 *     responses:
 *       200:
 *         description: 镜像信息
 */
router.get('/lc', (req, res) => {
  const record = libreChatService.getLatestRecord();
  if (record) {
    return res.json({
      update_time: record.updateTime,
      image_name: record.imageUrl
    });
  }
  return res.status(404).json({ error: 'No data available.' });
});

/**
 * @openapi
 * /librechat-image:
 *   get:
 *     summary: 兼容旧版API，获取最新镜像信息
 *     responses:
 *       200:
 *         description: 镜像信息
 */
router.get('/librechat-image', (req, res) => {
  const record = libreChatService.getLatestRecord();
  if (record) {
    return res.json({
      update_time: record.updateTime,
      image_url: record.imageUrl
    });
  }
  return res.status(404).json({ error: 'No data available.' });
});

/**
 * @openapi
 * /send:
 *   post:
 *     summary: 发送聊天消息
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, message]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 用户认证token
 *               message:
 *                 type: string
 *                 description: 聊天消息
 *     responses:
 *       200:
 *         description: 消息发送成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 认证失败
 */
router.post('/send', async (req, res) => {
  try {
    const { token, message } = req.body;

    // 验证token
    if (!token || token === 'invalid-token') {
      return res.status(401).json({ error: '无效的token' });
    }

    // 验证消息
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: '消息不能为空' });
    }

    // 验证消息长度
    if (message.length > 4000) {
      return res.status(400).json({ error: '消息过长' });
    }

    // 发送消息到LibreChat服务
    const response = await libreChatService.sendMessage(token, message);
    
    res.json({ response });
  } catch (error) {
    console.error('发送消息错误:', error);
    res.status(500).json({ error: '发送消息失败' });
  }
});

/**
 * @openapi
 * /history:
 *   get:
 *     summary: 获取聊天历史
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户认证token
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 聊天历史
 *       401:
 *         description: 认证失败
 */
router.get('/history', async (req, res) => {
  try {
    const { token, page = 1, limit = 20 } = req.query;

    // 验证token
    if (!token || token === 'invalid-token') {
      return res.status(401).json({ error: '无效的token' });
    }

    // 获取聊天历史
    const history = await libreChatService.getHistory(token as string, {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });

    res.json({
      history: history.messages,
      total: history.total,
      currentPage: parseInt(page as string),
      totalPages: Math.ceil(history.total / parseInt(limit as string))
    });
  } catch (error) {
    console.error('获取历史错误:', error);
    res.status(500).json({ error: '获取聊天历史失败' });
  }
});

/**
 * @openapi
 * /clear:
 *   delete:
 *     summary: 清除聊天历史
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 用户认证token
 *     responses:
 *       200:
 *         description: 清除成功
 *       401:
 *         description: 认证失败
 */
router.delete('/clear', async (req, res) => {
  try {
    const { token } = req.body;

    // 验证token
    if (!token || token === 'invalid-token') {
      return res.status(401).json({ error: '无效的token' });
    }

    // 清除聊天历史
    await libreChatService.clearHistory(token);
    
    res.json({ message: '聊天历史清除成功' });
  } catch (error) {
    console.error('清除历史错误:', error);
    res.status(500).json({ error: '清除聊天历史失败' });
  }
});

export default router; 