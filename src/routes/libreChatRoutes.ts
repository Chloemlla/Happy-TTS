import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { libreChatService } from '../services/libreChatService';
import { randomBytes } from 'crypto';

const router = Router();
// 与前端保持一致的消息长度上限（以字符近似 tokens 上限）
const MAX_MESSAGE_LEN = 8192;

// 从已登录上下文提取 userId（若存在）
function extractUserId(req: any): string | undefined {
  return req?.user?.id || req?.user?._id || req?.auth?.userId || req?.session?.userId || undefined;
}

// 轻量级 Cookie 解析（避免引入额外依赖）
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx > -1) {
      const k = decodeURIComponent(p.slice(0, idx).trim());
      const v = decodeURIComponent(p.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

// 从请求中提取 token（body/query/header/cookie 皆可）
function getTokenFromReq(req: any): string | undefined {
  const bodyToken = req?.body?.token;
  const queryToken = req?.query?.token;
  const headerToken = req?.headers?.['x-chat-token'] || req?.headers?.['x-libretoken'];
  if (typeof bodyToken === 'string' && bodyToken) return bodyToken;
  if (typeof queryToken === 'string' && queryToken) return queryToken;
  if (typeof headerToken === 'string' && headerToken) return headerToken as string;
  const cookies = parseCookies(req.headers?.cookie);
  if (cookies['lc_guest']) return cookies['lc_guest'];
  return undefined;
}

// 是否启用游客模式（默认关闭）
function isGuestEnabled(): boolean {
  const envFlag = String(process.env.LIBRECHAT_GUEST_ENABLED || '').toLowerCase();
  // 在非生产环境默认开启游客模式，生产环境需显式设置为 true
  if (process.env.NODE_ENV !== 'production') return envFlag === 'false' ? false : true;
  return envFlag === 'true';
}

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
 * /guest:
 *   post:
 *     summary: 申请游客 token（会通过 HttpOnly Cookie 下发）
 *     responses:
 *       200:
 *         description: 成功颁发游客 token
 *       403:
 *         description: 游客模式未启用
 */
router.post('/guest', (req, res) => {
  if (!isGuestEnabled()) {
    return res.status(403).json({ error: '游客模式未启用' });
  }
  // 生成高熵随机 token，带前缀标识
  const token = `guest_${randomBytes(24).toString('hex')}`;
  // 30 天有效期
  const maxAge = 30 * 24 * 60 * 60; // seconds
  // 通过 Set-Cookie 下发 HttpOnly Cookie
  // 注意：res.cookie 不需要额外中间件即可使用
  res.cookie('lc_guest', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (req.protocol === 'https') || (!!req.headers['x-forwarded-proto'] && String(req.headers['x-forwarded-proto']).includes('https')),
    path: '/',
    maxAge: maxAge * 1000,
  });
  return res.json({ token });
});

/**
 * @openapi
 * /message:
 *   put:
 *     summary: 修改单条消息内容
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, messageId, content]
 *             properties:
 *               token:
 *                 type: string
 *               messageId:
 *                 type: string
 *               content:
 *                 type: string
 *                 description: 新内容
 *     responses:
 *       200:
 *         description: 修改成功
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 认证失败
 */
router.put('/message', async (req, res) => {
  try {
    const { messageId, content } = req.body || {};
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    if (!token || token === 'invalid-token') {
      return res.status(401).json({ error: '无效的token' });
    }
    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ error: '缺少消息ID' });
    }
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: '缺少新内容' });
    }
    if (content.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: `消息过长，最大允许 ${MAX_MESSAGE_LEN} 字符` });
    }

    const { updated } = await libreChatService.updateMessage(token as string, messageId as string, content as string, userId);
    return res.json({ message: '修改成功', updated });
  } catch (error) {
    console.error('修改消息错误:', error);
    res.status(500).json({ error: '修改消息失败' });
  }
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
    const { message } = req.body;
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // 游客模式：允许无认证访问
    if (isGuestEnabled()) {
      // 游客模式下允许访问，无需严格验证
    } else {
      // 非游客模式：需要 token 或 已登录 userId
      if ((!token || token === 'invalid-token') && !userId) {
        return res.status(401).json({ error: '未认证：请提供有效 token 或登录后再试' });
      }
    }

    // 验证消息
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: '消息不能为空' });
    }

    // 验证消息长度（与前端同步）
    if (message.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: `消息过长，最大允许 ${MAX_MESSAGE_LEN} 字符` });
    }

    // 发送消息到LibreChat服务
    const response = await libreChatService.sendMessage(token ?? '', message, userId);

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
    const { page = 1, limit = 20 } = req.query as any;
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // 游客模式：允许无认证访问历史
    if (isGuestEnabled()) {
      // 游客模式下允许访问，但如果有token则使用token，否则使用默认游客身份
    } else {
      // 非游客模式：需要 token 或 已登录 userId
      if ((!token || token === 'invalid-token') && !userId) {
        return res.status(401).json({ error: '未认证：请提供有效 token 或登录后再试' });
      }
    }

    // 获取聊天历史
    const history = await libreChatService.getHistory(token as string, {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    }, userId);

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
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // 验证身份：允许 token 或 已登录 userId 其一存在
    if ((!token || token === 'invalid-token') && !userId) {
      return res.status(401).json({ error: '未认证：请提供有效 token 或登录后再试' });
    }

    // 清除聊天历史
    await libreChatService.clearHistory(token ?? '', userId);

    res.json({ message: '聊天历史清除成功' });
  } catch (error) {
    console.error('清除历史错误:', error);
    res.status(500).json({ error: '清除聊天历史失败' });
  }
});

/**
 * @openapi
 * /message:
 *   delete:
 *     summary: 删除单条消息
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户认证token
 *       - in: query
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: 消息ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 认证失败
 */
router.delete('/message', async (req, res) => {
  try {
    const { messageId } = req.query as any;
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // 验证身份：允许 token 或 已登录 userId 其一存在
    if ((!token || token === 'invalid-token') && !userId) {
      return res.status(401).json({ error: '未认证：请提供有效 token 或登录后再试' });
    }

    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ error: '缺少消息ID' });
    }

    // 删除单条消息
    const { removed } = await libreChatService.deleteMessage(token as string, messageId as string, userId);
    res.json({ message: '消息删除成功', removed });
  } catch (error) {
    console.error('删除消息错误:', error);
    res.status(500).json({ error: '删除消息失败' });
  }
});

/**
 * @openapi
 * /messages:
 *   delete:
 *     summary: 批量删除消息
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, messageIds]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 用户认证token
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 消息ID列表
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 认证失败
 */
router.delete('/messages', async (req, res) => {
  try {
    const { messageIds } = req.body;
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // 验证身份：允许 token 或 已登录 userId 其一存在
    if ((!token || token === 'invalid-token') && !userId) {
      return res.status(401).json({ error: '未认证：请提供有效 token 或登录后再试' });
    }

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: '缺少消息ID列表' });
    }

    // 批量删除消息
    const { removed } = await libreChatService.deleteMessages(token as string, messageIds as string[], userId);
    res.json({ message: '消息删除成功', removed });
  } catch (error) {
    console.error('批量删除消息错误:', error);
    res.status(500).json({ error: '批量删除消息失败' });
  }
});

/**
 * @openapi
 * /export:
 *   get:
 *     summary: 导出聊天历史
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户认证token
 *     responses:
 *       200:
 *         description: 聊天历史
 *       401:
 *         description: 认证失败
 */
router.get('/export', async (req, res) => {
  try {
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // 验证token
    if (!token || token === 'invalid-token') {
      return res.status(401).json({ error: '无效的token' });
    }

    // 导出聊天历史（作为文本附件返回）
    const { content, count } = await libreChatService.exportHistoryText(token as string, userId);
    const date = new Date().toISOString().slice(0, 10);
    // 为避免 Header 非法字符问题：
    // 1) 使用 ASCII 安全的 filename 作为回退
    // 2) 同时提供 RFC 5987 的 filename* 指向 UTF-8 编码的中文文件名
    const asciiName = `LibreChat_history_${date}_${count}.txt`;
    const utf8Name = `LibreChat_历史_${date}_${count}条.txt`;
    const encoded = encodeURIComponent(utf8Name);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(content);
  } catch (error) {
    console.error('导出历史错误:', error);
    res.status(500).json({ error: '导出聊天历史失败' });
  }
});

// ================= 管理员接口（仅管理后台使用） =================
// 列出用户概览
router.get('/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const kw = (req.query.kw as string) || '';
    const page = parseInt((req.query.page as string) || '1');
    const limit = parseInt((req.query.limit as string) || '20');
    const data = await libreChatService.adminListUsers(kw, page, limit);
    res.json(data);
  } catch (error) {
    console.error('管理员获取用户列表错误:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 查看指定用户历史
router.get('/admin/users/:userId/history', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params as { userId: string };
    const page = parseInt((req.query.page as string) || '1');
    const limit = parseInt((req.query.limit as string) || '20');
    const data = await libreChatService.adminGetUserHistory(userId, page, limit);
    res.json(data);
  } catch (error) {
    console.error('管理员获取用户历史错误:', error);
    res.status(500).json({ error: '获取用户历史失败' });
  }
});

// 删除指定用户全部历史
router.delete('/admin/users/:userId', authenticateAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params as { userId: string };
    if (userId === 'all') return next();
    const ret = await libreChatService.adminDeleteUser(userId);
    res.json({ message: '指定用户聊天历史已删除', ...ret });
  } catch (error) {
    console.error('管理员删除用户历史错误:', error);
    res.status(500).json({ error: '删除用户历史失败' });
  }
});

// 批量删除多个用户全部历史
router.delete('/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { userIds } = req.body as { userIds: string[] };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '请提供要删除的用户ID列表' });
    }
    const ret = await libreChatService.adminBatchDeleteUsers(userIds);
    res.json({ message: `批量删除完成，共删除 ${ret.deleted} 个用户的历史记录`, ...ret });
  } catch (error) {
    console.error('管理员批量删除用户历史错误:', error);
    res.status(500).json({ error: '批量删除用户历史失败' });
  }
});

// 删除所有用户历史（危险操作）
router.delete('/admin/users/all', authenticateAdmin, async (req, res) => {
  try {
    const { confirm } = req.body as { confirm: boolean };
    const { statusCode, body } = await libreChatService.adminDeleteAllUsersAction({ confirm });
    res.status(statusCode).json(body);
  } catch (error) {
    console.error('管理员删除所有用户历史错误:', error);
    res.status(500).json({ error: '删除所有用户历史失败' });
  }
});

export default router;