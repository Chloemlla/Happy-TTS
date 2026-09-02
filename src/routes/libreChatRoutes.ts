import { Router, type Request, type Response } from "express";
import { isAdminRole } from "../middleware/auth";
import { optionalAuthenticateToken } from "../middleware/optionalAuthenticateToken";
import { libreChatLimiter } from "../middleware/routeLimiters";
import { libreChatService } from "../services/libreChatService";
import { toChatMessagesView } from "../services/librechat/diagnostics";
import {
  ensureLibreChatGuestCookie,
  isLibreChatGuestEnabled,
  LIBRECHAT_GUEST_MAX_AGE_MS,
  type LibreChatIdentity,
  resolveLibreChatIdentity,
} from "./libreChatIdentity";
import { registerLibreChatAdminRoutes } from "./libreChatRoutes.admin";
import { normalizePagination } from "./libreChatRoutes.shared";

const router = Router();
// 与前端保持一致的消息长度上限（以字符近似 tokens 上限）
const MAX_MESSAGE_LEN = 4096;

router.use(libreChatLimiter, optionalAuthenticateToken);

function sendLibreChatError(
  res: Response,
  status: number,
  code: string,
  error: string,
  details?: Record<string, unknown>,
) {
  return res.status(status).json({
    success: false,
    code,
    error,
    message: error,
    ...(details ? { details } : {}),
  });
}

function normalizeMessage(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAdminRequest(req: any): boolean {
  return isAdminRole(req?.user?.role);
}

async function requireLibreChatIdentity(req: Request, res: Response): Promise<LibreChatIdentity | null> {
  const resolution = resolveLibreChatIdentity(req, res);
  if (resolution.ok) {
    await libreChatService.prepareOwnerHistory(resolution.identity.ownerKey, resolution.identity.legacyOwnerId);
    return resolution.identity;
  }
  if (resolution.reason === "account-suspended") {
    sendLibreChatError(res, 403, "ACCOUNT_SUSPENDED", "账户已被封停");
  } else if (resolution.reason === "invalid-token") {
    sendLibreChatError(res, 401, "INVALID_TOKEN", "无效的token");
  } else {
    sendLibreChatError(res, 401, "AUTH_REQUIRED", "未认证：请登录或启用游客模式后再试");
  }
  return null;
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
router.get("/lc", (_req, res) => {
  const record = libreChatService.getLatestRecord();
  if (record) {
    return res.json({
      update_time: record.updateTime,
      image_name: record.imageUrl,
    });
  }
  return res.status(404).json({ error: "No data available." });
});

/**
 * @openapi
 * /guest:
 *   post:
 *     summary: 申请游客身份（仅通过 HttpOnly Cookie 下发凭据）
 *     responses:
 *       200:
 *         description: 成功建立游客会话，响应体不包含凭据
 *       403:
 *         description: 游客模式未启用
 */
router.post("/guest", (req, res) => {
  if (!isLibreChatGuestEnabled()) {
    return sendLibreChatError(res, 403, "GUEST_DISABLED", "游客模式未启用");
  }
  ensureLibreChatGuestCookie(req, res);
  return res.json({ success: true, expiresIn: Math.floor(LIBRECHAT_GUEST_MAX_AGE_MS / 1000) });
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
 *             required: [messageId, content]
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
router.put("/message", async (req, res) => {
  try {
    const { messageId, content } = req.body || {};
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;
    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "缺少消息ID" });
    }
    if (typeof content !== "string" || content.trim() === "") {
      return res.status(400).json({ error: "缺少新内容" });
    }
    if (content.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: `消息过长，最大允许 ${MAX_MESSAGE_LEN} 字符` });
    }

    const { updated } = await libreChatService.updateMessage(identity.ownerKey, messageId as string, content as string);
    return res.json({ message: "修改成功", updated });
  } catch (error) {
    console.error("修改消息错误:", error);
    res.status(500).json({ error: "修改消息失败" });
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
router.get("/librechat-image", (_req, res) => {
  const record = libreChatService.getLatestRecord();
  if (record) {
    return res.json({
      update_time: record.updateTime,
      image_url: record.imageUrl,
    });
  }
  return res.status(404).json({ error: "No data available." });
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
 *             required: [message]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
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
router.post("/send", async (req, res) => {
  try {
    const message = normalizeMessage(req.body?.message);
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    // 验证消息
    if (!message) {
      return sendLibreChatError(res, 400, "EMPTY_MESSAGE", "消息不能为空");
    }

    // 验证消息长度（与前端同步）
    if (message.length > MAX_MESSAGE_LEN) {
      return sendLibreChatError(res, 400, "MESSAGE_TOO_LONG", `消息过长，最大允许 ${MAX_MESSAGE_LEN} 字符`, {
        maxLength: MAX_MESSAGE_LEN,
      });
    }

    // 发送消息到LibreChat服务
    const response = await libreChatService.sendMessage(identity.ownerKey, message);

    res.json({
      success: true,
      response,
      meta: {
        messageLength: message.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("发送消息错误:", error);

    sendLibreChatError(res, 500, "SEND_FAILED", "发送消息失败");
  }
});

/**
 * @openapi
 * /history:
 *   get:
 *     summary: 获取聊天历史
 *     parameters:
 *       - in: header
 *         name: x-chat-token
 *         required: false
 *         schema:
 *           type: string
 *         description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
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
router.get("/history", async (req, res) => {
  try {
    const { page, limit } = normalizePagination(req.query.page, req.query.limit);
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    // 获取聊天历史
    const history = await libreChatService.getHistory(
      identity.ownerKey,
      {
        page,
        limit,
      },
    );

    const totalPages = history.total > 0 ? Math.ceil(history.total / limit) : 1;
    res.json({
      success: true,
      history: toChatMessagesView(history.messages, isAdminRequest(req)),
      total: history.total,
      currentPage: page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error("获取历史错误:", error);
    sendLibreChatError(res, 500, "HISTORY_FAILED", "获取聊天历史失败");
  }
});

/**
 * @openapi
 * /clear:
 *   delete:
 *     summary: 清除聊天历史
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
 *     responses:
 *       200:
 *         description: 清除成功
 *       401:
 *         description: 认证失败
 */
router.delete("/clear", async (req, res) => {
  try {
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;
    await libreChatService.clearHistory(identity.ownerKey);
    res.json({ message: "聊天历史清除成功" });
  } catch (error) {
    console.error("清除历史错误:", error);
    res.status(500).json({ error: "清除聊天历史失败" });
  }
});

/**
 * @openapi
 * /message:
 *   delete:
 *     summary: 删除单条消息
 *     parameters:
 *       - in: header
 *         name: x-chat-token
 *         required: false
 *         schema:
 *           type: string
 *         description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
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
router.delete("/message", async (req, res) => {
  try {
    const { messageId } = req.query as any;
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ error: "缺少消息ID" });
    }

    // 删除单条消息
    const { removed } = await libreChatService.deleteMessage(identity.ownerKey, messageId as string);
    res.json({ message: "消息删除成功", removed });
  } catch (error) {
    console.error("删除消息错误:", error);
    res.status(500).json({ error: "删除消息失败" });
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
 *             required: [messageIds]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
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
router.delete("/messages", async (req, res) => {
  try {
    const { messageIds } = req.body;
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: "缺少消息ID列表" });
    }

    // 批量删除消息
    const { removed } = await libreChatService.deleteMessages(identity.ownerKey, messageIds as string[]);
    res.json({ message: "消息删除成功", removed });
  } catch (error) {
    console.error("批量删除消息错误:", error);
    res.status(500).json({ error: "批量删除消息失败" });
  }
});

/**
 * @openapi
 * /retry:
 *   post:
 *     summary: 携带上下文重试指定助手消息
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageId]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
 *               messageId:
 *                 type: string
 *                 description: 需要重试的助手消息ID
 *     responses:
 *       200:
 *         description: 重试成功，返回新的回复
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 认证失败
 */
router.post("/retry", async (req, res) => {
  try {
    const { messageId } = req.body || {};
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    if (!messageId || typeof messageId !== "string") {
      return sendLibreChatError(res, 400, "MESSAGE_ID_REQUIRED", "缺少消息ID");
    }

    const response = await libreChatService.retryMessage(identity.ownerKey, messageId as string);
    return res.json({
      success: true,
      response,
      meta: {
        messageId,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("重试生成错误:", error);

    sendLibreChatError(res, 500, "RETRY_FAILED", "重试失败");
  }
});

/**
 * @openapi
 * /export:
 *   get:
 *     summary: 导出聊天历史
 *     parameters:
 *       - in: header
 *         name: x-chat-token
 *         required: false
 *         schema:
 *           type: string
 *         description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
 *     responses:
 *       200:
 *         description: 聊天历史
 *       401:
 *         description: 认证失败
 */
router.get("/export", async (req, res) => {
  try {
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    // 导出聊天历史（作为文本附件返回）
    const { content, count } = await libreChatService.exportHistoryText(identity.ownerKey);
    const date = new Date().toISOString().slice(0, 10);
    // 为避免 Header 非法字符问题：
    // 1) 使用 ASCII 安全的 filename 作为回退
    // 2) 同时提供 RFC 5987 的 filename* 指向 UTF-8 编码的中文文件名
    const asciiName = `LibreChat_history_${date}_${count}.txt`;
    const utf8Name = `LibreChat_历史_${date}_${count}条.txt`;
    const encoded = encodeURIComponent(utf8Name);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`);
    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).send(content);
  } catch (error) {
    console.error("导出历史错误:", error);
    res.status(500).json({ error: "导出聊天历史失败" });
  }
});

/**
 * @openapi
 * /sse:
 *   get:
 *     summary: 建立SSE连接接收实时通知
 *     parameters:
 *       - in: header
 *         name: x-chat-token
 *         schema:
 *           type: string
 *         description: 旧版会话凭据；登录身份与 HttpOnly 游客 Cookie 优先
 *     responses:
 *       200:
 *         description: SSE连接建立成功
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Server-Sent Events流
 *       401:
 *         description: 认证失败
 */
router.get("/sse", async (req, res) => {
  try {
    const identity = await requireLibreChatIdentity(req, res);
    if (!identity) return;

    // 设置SSE响应头
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // 注册SSE客户端
    const clientId = libreChatService.registerSSEClient(identity.ownerKey, res);

    // 保持连接活跃
    const keepAliveInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`);
      } catch (_error) {
        clearInterval(keepAliveInterval);
        libreChatService.removeSSEClient(clientId);
      }
    }, 30000); // 每30秒发送ping
    keepAliveInterval.unref?.();

    // 统一在任意一侧断开时清理定时器与注册记录（req/res 都挂，防止代理断开只走 res 侧）
    const cleanupSSE = () => {
      clearInterval(keepAliveInterval);
      libreChatService.removeSSEClient(clientId);
    };
    req.on("close", cleanupSSE);
    req.on("error", () => cleanupSSE());
    res.on("close", cleanupSSE);
  } catch (error) {
    console.error("SSE连接错误:", error);
    res.status(500).json({ error: "SSE连接失败" });
  }
});

registerLibreChatAdminRoutes(router);

export default router;
