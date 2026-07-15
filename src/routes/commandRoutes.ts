import * as crypto from "node:crypto";
import { type RequestHandler, Router } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { commandLimiter } from "../middleware/routeLimiters";
import { commandService } from "../services/commandService";
import { isAdminOperationPasswordValid } from "../utils/adminOperationPassword";
import logger from "../utils/logger";

const router = Router();

const ensureAdmin = (req: any, res: any): boolean => {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "需要管理员权限" });
    return false;
  }
  return true;
};

function getBearerToken(req: { headers: { authorization?: string } }): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function encryptWithToken(payload: unknown, token: string): { data: string; iv: string } {
  const key = crypto.createHash("sha256").update(token).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), "utf8", "hex");
  encrypted += cipher.final("hex");
  return { data: encrypted, iv: iv.toString("hex") };
}

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
router.post("/y", commandLimiter, authenticateToken, async (req, res) => {
  const { command, password } = req.body;

  if (!ensureAdmin(req, res)) {
    return;
  }

  if (!isAdminOperationPasswordValid(password)) {
    logger.warn("[CommandManager] 密码验证失败", { reason: "invalid-password", path: "/y" });
    return res.status(403).json({ error: "密码错误" });
  }

  try {
    const result = await commandService.addCommand(command as string, password as string);

    if (result.status === "error") {
      return res.status(403).json(result);
    }

    return res.json(result);
  } catch (error) {
    logger.error("[CommandManager] 添加命令失败", { error });
    return res.status(500).json({ error: "添加命令失败" });
  }
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
router.get("/q", commandLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await commandService.getNextCommand();
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "未携带Token，请先登录" });
    }

    const encrypted = encryptWithToken(result, token);
    logger.info("[CommandManager] 命令队列已加密返回", {
      path: "/q",
      hasPayload: Boolean(result),
    });

    return res.json({
      success: true,
      data: encrypted.data,
      iv: encrypted.iv,
    });
  } catch (error) {
    logger.error("[CommandManager] 获取命令失败", { error });
    return res.status(500).json({ error: "获取命令失败" });
  }
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
router.post("/p", commandLimiter, authenticateToken, async (req, res) => {
  if (!ensureAdmin(req, res)) {
    return;
  }

  const { command } = req.body;
  const result = await commandService.removeCommand(command);
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
router.post("/execute", commandLimiter, async (req, res) => {
  try {
    const { command, password } = req.body;

    if (!isAdminOperationPasswordValid(password)) {
      logger.warn("[CommandManager] 密码验证失败", { reason: "invalid-password", path: "/execute" });
      return res.status(403).json({ error: "密码错误" });
    }

    const dangerousCommands = [
      "rm -rf /",
      "rm -rf /*",
      "format c:",
      "del /s /q c:\\",
      "sudo rm -rf /",
      "dd if=/dev/zero of=/dev/sda",
      "mkfs.ext4 /dev/sda1",
    ];

    if (dangerousCommands.some((cmd) => command.includes(cmd))) {
      return res.status(400).json({ error: "危险命令被拒绝" });
    }

    const output = await commandService.executeCommand(command);
    return res.json({ output });
  } catch (error) {
    logger.error("[CommandManager] 命令执行错误", { error });
    return res.status(500).json({ error: "命令执行失败" });
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
router.post("/status", (req, res) => {
  try {
    const { password } = req.body;

    if (!isAdminOperationPasswordValid(password)) {
      logger.warn("[CommandManager] 密码验证失败", { reason: "invalid-password", path: "/status" });
      return res.status(403).json({ error: "密码错误" });
    }

    const status = commandService.getServerStatus();
    return res.json(status);
  } catch (error) {
    logger.error("[CommandManager] 获取状态错误", { error });
    return res.status(500).json({ error: "获取服务器状态失败" });
  }
});

/**
 * @openapi
 * /command/history:
 *   get:
 *     summary: 获取执行历史
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 返回历史记录数量限制
 *     responses:
 *       200:
 *         description: 执行历史列表
 */
router.get("/history", commandLimiter, authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const history = await commandService.getExecutionHistory(limit);
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "未携带Token，请先登录" });
    }

    const encrypted = encryptWithToken(history, token);
    return res.json({ success: true, data: encrypted.data, iv: encrypted.iv });
  } catch (error) {
    logger.error("[CommandManager] 获取历史失败", { error });
    return res.status(500).json({ error: "获取执行历史失败" });
  }
});

/**
 * @openapi
 * /command/clear-history:
 *   post:
 *     summary: 清空执行历史
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
 *         description: 清空结果
 */
router.post("/clear-history", commandLimiter, authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!isAdminOperationPasswordValid(password)) {
      logger.warn("[CommandManager] 密码验证失败", {
        reason: "invalid-password",
        path: "/clear-history",
      });
      return res.status(403).json({ error: "密码错误" });
    }

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await commandService.clearExecutionHistory();
    return res.json(result);
  } catch (error) {
    logger.error("[CommandManager] 清空历史失败", { error });
    return res.status(500).json({ error: "清空执行历史失败" });
  }
});

/**
 * @openapi
 * /command/clear-queue:
 *   post:
 *     summary: 清空命令队列
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
 *         description: 清空结果
 */
router.post("/clear-queue", commandLimiter, authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!isAdminOperationPasswordValid(password)) {
      logger.warn("[CommandManager] 密码验证失败", {
        reason: "invalid-password",
        path: "/clear-queue",
      });
      return res.status(403).json({ error: "密码错误" });
    }

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await commandService.clearCommandQueue();
    return res.json(result);
  } catch (error) {
    logger.error("[CommandManager] 清空队列失败", { error });
    return res.status(500).json({ error: "清空命令队列失败" });
  }
});

let commandStatusHandler: RequestHandler | undefined = undefined;
for (const r of router.stack) {
  if (r.route && r.route.path === "/status") {
    commandStatusHandler = r.route.stack[0].handle;
    break;
  }
}

export { commandStatusHandler };

export default router;
