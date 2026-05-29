import { type NextFunction, type Request, type Response, Router } from "express";
import adminOnly from "../middleware/adminOnly";
import { authenticateToken } from "../middleware/authenticateToken";
import { replayProtection } from "../middleware/replayProtection";
import { tamperService } from "../services/tamperService";
import { firstStringOr } from "../utils/httpParam";
import logger from "../utils/logger";

const router = Router();

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/**
 * @openapi
 * /api/tamper/report-tampering:
 *   post:
 *     summary: 上报篡改事件
 *     description: |
 *       客户端检测到篡改事件时调用此接口上报。
 *       系统会记录篡改事件并可能对相关IP进行临时封禁。
 *       此接口无需认证，但会进行限流保护。
 *     tags:
 *       - 防篡改
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType:
 *                 type: string
 *                 description: 篡改事件类型
 *                 example: "dom_modification"
 *                 enum: ["dom_modification", "network_tampering", "proxy_tampering", "script_injection", "file_modification"]
 *               elementId:
 *                 type: string
 *                 description: 被篡改的DOM元素ID
 *                 example: "app-header"
 *               filePath:
 *                 type: string
 *                 description: 被篡改的文件路径
 *                 example: "/static/js/app.js"
 *               checksum:
 *                 type: string
 *                 description: 内容校验和
 *                 example: "sha256:abc123..."
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: 事件发生时间（ISO格式）
 *                 example: "2024-01-01T12:00:00.000Z"
 *               url:
 *                 type: string
 *                 description: 发生篡改的页面URL
 *                 example: "https://example.com/page"
 *               tamperType:
 *                 type: string
 *                 description: 篡改类型
 *                 example: "dom"
 *                 enum: ["dom", "network", "proxy", "injection"]
 *               detectionMethod:
 *                 type: string
 *                 description: 检测方法
 *                 example: "mutation-observer"
 *               originalContent:
 *                 type: string
 *                 description: 原始内容
 *                 example: "Synapse"
 *               tamperContent:
 *                 type: string
 *                 description: 篡改后的内容
 *                 example: "Modified Content"
 *               attempts:
 *                 type: number
 *                 description: 篡改尝试次数
 *                 example: 3
 *               userAgent:
 *                 type: string
 *                 description: 客户端用户代理
 *                 example: "Mozilla/5.0..."
 *               additionalInfo:
 *                 type: object
 *                 description: 额外的篡改信息
 *                 properties:
 *                   screenResolution:
 *                     type: string
 *                     example: "1920x1080"
 *                   pageTitle:
 *                     type: string
 *                     example: "Synapse"
 *                   referrer:
 *                     type: string
 *                     example: "https://google.com"
 *                 additionalProperties: true
 *           examples:
 *             domModification:
 *               summary: DOM修改事件
 *               value:
 *                 eventType: "dom_modification"
 *                 elementId: "app-header"
 *                 url: "https://example.com/page"
 *                 timestamp: "2024-01-01T12:00:00.000Z"
 *                 tamperType: "dom"
 *                 detectionMethod: "mutation-observer"
 *                 originalContent: "Synapse"
 *                 tamperContent: "Modified Content"
 *                 attempts: 1
 *                 checksum: "sha256:abc123def456"
 *                 additionalInfo:
 *                   screenResolution: "1920x1080"
 *                   pageTitle: "Synapse"
 *                   referrer: "https://google.com"
 *             scriptInjection:
 *               summary: 脚本注入事件
 *               value:
 *                 eventType: "script_injection"
 *                 elementId: "script-container"
 *                 filePath: "/index.html"
 *                 url: "https://example.com/page"
 *                 timestamp: "2024-01-01T12:00:00.000Z"
 *                 tamperType: "injection"
 *                 detectionMethod: "content-analysis"
 *                 checksum: "sha256:xyz789"
 *                 additionalInfo:
 *                   injectionType: "malicious_script"
 *                   detectedPattern: "eval("
 *             proxyTampering:
 *               summary: 代理篡改事件
 *               value:
 *                 eventType: "proxy_tampering"
 *                 url: "https://example.com/page"
 *                 timestamp: "2024-01-01T12:00:00.000Z"
 *                 tamperType: "proxy"
 *                 detectionMethod: "network-analysis"
 *                 originalContent: "Synapse"
 *                 tamperContent: "Replaced Content"
 *                 additionalInfo:
 *                   proxyHeaders: ["via", "x-forwarded-for"]
 *                   responseTimeAnomaly: true
 *     responses:
 *       200:
 *         description: 篡改报告已成功记录
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "篡改报告已记录"
 *       400:
 *         description: 请求数据无效
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "无效的请求数据"
 *       403:
 *         description: IP已被临时封禁
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "您的访问已被临时封禁"
 *                 reason:
 *                   type: string
 *                   example: "多次篡改检测"
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-01T12:00:00Z"
 *       429:
 *         description: 请求过于频繁
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "防篡改验证请求过于频繁，请稍后再试"
 *       500:
 *         description: 内部服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "内部服务器错误"
 *     security: []
 */
router.post("/report-tampering", replayProtection(), async (req, res) => {
  try {
    // 验证请求体是否存在
    if (!req.body || typeof req.body !== "object") {
      logger.warn("Invalid request body for tamper report", {
        ip: req.ip || req.connection.remoteAddress,
        contentType: req.headers["content-type"],
      });
      return res.status(400).json({ error: "无效的请求数据" });
    }

    const tamperEvent = {
      ...req.body,
      ip: req.ip || req.connection.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || req.body.userAgent,
      // 确保必要字段存在
      elementId: req.body.elementId || "unknown-element",
      timestamp: req.body.timestamp || new Date().toISOString(),
      url: req.body.url || "unknown-url",
      signed: Boolean(req.headers["x-signature"]),
    };

    const storedEvent = await tamperService.recordTamperEvent(tamperEvent);

    // 检查是否需要立即返回封禁响应
    if (tamperService.isIPBlocked(tamperEvent.ip)) {
      const details = tamperService.getBlockDetails(tamperEvent.ip);
      return res.status(403).json({
        error: "您的访问已被临时封禁",
        reason: details?.reason,
        expiresAt: details?.expiresAt,
      });
    }

    res.status(200).json({ message: "篡改报告已记录", eventId: storedEvent.id });
  } catch (error) {
    logger.error("Error handling tamper report:", error);
    res.status(500).json({ error: "内部服务器错误" });
  }
});

router.get("/admin/summary", authenticateToken, adminOnly, async (req, res) => {
  try {
    const limit = boundedNumber(req.query.limit, 20, 1, 100);
    const data = await tamperService.getSummary(limit);
    res.json({ success: true, data });
  } catch (error) {
    logger.error("Error loading tamper summary:", error);
    res.status(500).json({ error: "获取防篡改摘要失败" });
  }
});

router.get("/admin/events", authenticateToken, adminOnly, async (req, res) => {
  try {
    const data = await tamperService.listTamperEvents({
      limit: boundedNumber(req.query.limit, 50, 1, 200),
      offset: boundedNumber(req.query.offset, 0, 0, 100000),
      ip: typeof req.query.ip === "string" ? req.query.ip : undefined,
      tamperType: typeof req.query.tamperType === "string" ? req.query.tamperType : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    logger.error("Error loading tamper events:", error);
    res.status(500).json({ error: "获取篡改事件失败" });
  }
});

router.get("/admin/blocked", authenticateToken, adminOnly, async (_req, res) => {
  try {
    await tamperService.clearExpiredBlockedIPs();
    res.json({ success: true, data: tamperService.listBlockedIPs() });
  } catch (error) {
    logger.error("Error loading tamper blocked IPs:", error);
    res.status(500).json({ error: "获取封禁 IP 失败" });
  }
});

router.post("/admin/blocked", authenticateToken, adminOnly, replayProtection(), async (req, res) => {
  try {
    const ip = typeof req.body?.ip === "string" ? req.body.ip : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "管理员手动封禁";
    const durationHours = boundedNumber(req.body?.durationHours, 24, 1, 24 * 30);
    const blocked = await tamperService.blockIP(ip, reason, durationHours);
    res.json({ success: true, data: blocked });
  } catch (error) {
    logger.warn("Error manually blocking tamper IP:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "封禁 IP 失败" });
  }
});

router.delete("/admin/blocked/:ip", authenticateToken, adminOnly, replayProtection(), async (req, res) => {
  try {
    const removed = await tamperService.unblockIP(firstStringOr(req.params.ip));
    res.json({ success: true, removed });
  } catch (error) {
    logger.error("Error unblocking tamper IP:", error);
    res.status(500).json({ error: "解除封禁失败" });
  }
});

// 添加错误处理中间件，专门处理 JSON 解析错误
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    logger.warn("JSON parse error in tamper route", {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      error: err.message,
    });
    return res.status(400).json({ error: "无效的JSON格式" });
  }
  next(err);
});

export default router;
