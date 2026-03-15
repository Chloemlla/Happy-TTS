import * as crypto from "node:crypto";
import { type RequestHandler, Router } from "express";
import { config } from "../config/config";
import { authenticateToken } from "../middleware/authenticateToken";
import { commandLimiter } from "../middleware/routeLimiters";
import { commandService } from "../services/commandService";

const router = Router();

const ensureAdmin = (req: any, res: any): boolean => {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "需要管理员权限" });
    return false;
  }
  return true;
};

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

  // 验证密码
  if (password !== config.adminPassword) {
    console.log("❌ [CommandManager] 密码验证失败");
    return res.status(403).json({ error: "密码错误" });
  }

  try {
    const result = await commandService.addCommand(command as string, password as string);

    if (result.status === "error") {
      return res.status(403).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("❌ [CommandManager] 添加命令失败:", error);
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
    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await commandService.getNextCommand();

    // 获取管理员token作为加密密钥
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "未携带Token，请先登录" });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    if (!token) {
      return res.status(401).json({ error: "Token为空" });
    }

    console.log("✅ [CommandManager] Token获取成功，长度:", token.length);

    // 准备加密数据
    const jsonData = JSON.stringify(result);
    console.log("📝 [CommandManager] JSON数据准备完成，长度:", jsonData.length);

    // 使用AES-256-CBC加密数据
    console.log("🔐 [CommandManager] 开始AES-256-CBC加密...");
    const algorithm = "aes-256-cbc";

    // 生成密钥
    console.log("   生成密钥...");
    const key = crypto.createHash("sha256").update(token).digest();
    console.log("   密钥生成完成，长度:", key.length);

    // 生成IV
    console.log("   生成初始化向量(IV)...");
    const iv = crypto.randomBytes(16);
    console.log("   IV生成完成，长度:", iv.length);
    console.log("   IV (hex):", iv.toString("hex"));

    // 创建加密器
    console.log("   创建加密器...");
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    // 执行加密
    console.log("   开始加密数据...");
    let encrypted = cipher.update(jsonData, "utf8", "hex");
    encrypted += cipher.final("hex");

    console.log("✅ [CommandManager] 加密完成");
    console.log("   原始数据长度:", jsonData.length);
    console.log("   加密后数据长度:", encrypted.length);
    console.log("   加密算法:", algorithm);
    console.log("   密钥长度:", key.length);
    console.log("   IV长度:", iv.length);

    // 返回加密后的数据
    const response = {
      success: true,
      data: encrypted,
      iv: iv.toString("hex"),
    };

    console.log("📤 [CommandManager] 准备返回加密数据");
    console.log("   响应数据大小:", JSON.stringify(response).length);

    res.json(response);

    console.log("✅ [CommandManager] 命令队列加密请求处理完成");
  } catch (error) {
    console.error("❌ [CommandManager] 获取命令失败:", error);
    res.status(500).json({ error: "获取命令失败" });
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
router.post("/p", commandLimiter, authenticateToken, (req, res) => {
  if (!ensureAdmin(req, res)) {
    return;
  }

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
router.post("/execute", commandLimiter, authenticateToken, async (req, res) => {
  try {
    const { command, password } = req.body;

    if (!ensureAdmin(req, res)) {
      return;
    }

    // 验证密码
    if (password !== config.adminPassword) {
      return res.status(403).json({ error: "密码错误" });
    }

    // 检查危险命令
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

    // 执行命令
    const output = await commandService.executeCommand(command);
    res.json({ output });
  } catch (error) {
    console.error("命令执行错误:", error);
    res.status(500).json({ error: "命令执行失败" });
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
router.post("/status", authenticateToken, (req, res) => {
  try {
    const { password } = req.body;

    // 验证密码
    if (password !== config.adminPassword) {
      return res.status(403).json({ error: "密码错误" });
    }

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    // 获取服务器状态
    const status = commandService.getServerStatus();

    // 获取管理员token作为加密密钥
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "未携带Token，请先登录" });
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    if (!token) {
      return res.status(401).json({ error: "Token为空" });
    }

    console.log("✅ [CommandManager] Token获取成功，长度:", token.length);

    // 准备加密数据
    const jsonData = JSON.stringify(status);
    console.log("📝 [CommandManager] JSON数据准备完成，长度:", jsonData.length);

    // 使用AES-256-CBC加密数据
    console.log("🔐 [CommandManager] 开始AES-256-CBC加密...");
    const algorithm = "aes-256-cbc";

    // 生成密钥
    console.log("   生成密钥...");
    const key = crypto.createHash("sha256").update(token).digest();
    console.log("   密钥生成完成，长度:", key.length);

    // 生成IV
    console.log("   生成初始化向量(IV)...");
    const iv = crypto.randomBytes(16);
    console.log("   IV生成完成，长度:", iv.length);
    console.log("   IV (hex):", iv.toString("hex"));

    // 创建加密器
    console.log("   创建加密器...");
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    // 执行加密
    console.log("   开始加密数据...");
    let encrypted = cipher.update(jsonData, "utf8", "hex");
    encrypted += cipher.final("hex");

    console.log("✅ [CommandManager] 加密完成");
    console.log("   原始数据长度:", jsonData.length);
    console.log("   加密后数据长度:", encrypted.length);
    console.log("   加密算法:", algorithm);
    console.log("   密钥长度:", key.length);
    console.log("   IV长度:", iv.length);

    // 返回加密后的数据
    const response = {
      success: true,
      data: encrypted,
      iv: iv.toString("hex"),
    };

    console.log("📤 [CommandManager] 准备返回加密数据");
    console.log("   响应数据大小:", JSON.stringify(response).length);

    res.json(response);

    console.log("✅ [CommandManager] 服务器状态加密请求处理完成");
  } catch (error) {
    console.error("❌ [CommandManager] 获取状态错误:", error);
    res.status(500).json({ error: "获取服务器状态失败" });
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
    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const history = await commandService.getExecutionHistory(limit);

    // 获取管理员token作为加密密钥
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "未携带Token，请先登录" });
    }

    const token = authHeader.substring(7);
    if (!token) {
      return res.status(401).json({ error: "Token为空" });
    }

    // 使用AES-256-CBC加密数据
    const key = crypto.createHash("sha256").update(token).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(JSON.stringify(history), "utf8", "hex");
    encrypted += cipher.final("hex");

    res.json({ success: true, data: encrypted, iv: iv.toString("hex") });
  } catch (error) {
    console.error("❌ [CommandManager] 获取历史失败:", error);
    res.status(500).json({ error: "获取执行历史失败" });
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

    // 验证密码
    if (password !== config.adminPassword) {
      return res.status(403).json({ error: "密码错误" });
    }

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await commandService.clearExecutionHistory();
    res.json(result);
  } catch (error) {
    console.error("❌ [CommandManager] 清空历史失败:", error);
    res.status(500).json({ error: "清空执行历史失败" });
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

    // 验证密码
    if (password !== config.adminPassword) {
      return res.status(403).json({ error: "密码错误" });
    }

    // 检查管理员权限
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "需要管理员权限" });
    }

    const result = await commandService.clearCommandQueue();
    res.json(result);
  } catch (error) {
    console.error("❌ [CommandManager] 清空队列失败:", error);
    res.status(500).json({ error: "清空命令队列失败" });
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
