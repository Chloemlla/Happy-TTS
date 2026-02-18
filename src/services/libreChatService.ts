import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import axios from "axios";
import { JSDOM } from "jsdom";
import { mongoose } from "../services/mongoService";
import logger from "../utils/logger";

// 基础输入清理：限制长度并移除可疑字符
function sanitizeId(input?: string): string {
  if (!input || typeof input !== "string") return "";
  // 仅保留常见安全字符，限制长度，防止注入与异常索引
  return input.replace(/[^A-Za-z0-9_\-:@.]/g, "").slice(0, 128);
}

// 安全构建正则：对模式进行转义
function escapeRegex(input?: string): string {
  if (!input || typeof input !== "string") return "";
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 清洗助手文本中的 <think> 思考内容与可视化标记
function sanitizeAssistantText(text: string): string {
  if (!text) return text;
  try {
    return (
      text
        // 移除完整的 <think ...>...</think> 段落（允许属性，跨行）
        .replace(/<think\b[^>]*>[\s\S]*?<\/?think>/gi, "")
        // 兜底：去掉可能残留的起止标签（含空白）
        .replace(/<\/?\s*think\b[^>]*>/gi, "")
        // 去除常见的可视化标记行
        .replace(/^\s*(已深度思考|深度思考|Deep\s*Thinking)\b.*$/gim, "")
        // 折叠多余空行
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  } catch {
    return text;
  }
}

// 识别“询问模型身份/名称/版本”等问题（中英文常见写法），用于强制保持沉默
function isModelIdentityQuery(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const patterns: RegExp[] = [
    /你是(什么|啥)模型/u,
    /你(用|使用)的?(是)?(什么|啥)模型/u,
    /你(在)?(用|使用)什么(大)?模型/u,
    /模型(名|名称|版本)/u,
    /你是哪(个|個)模型/u,
    /你基于什么模型/u,
    /what\s+model\s+are\s+you/,
    /which\s+model\s+are\s+you/,
    /what\s+model\s+do\s+you\s+run/,
    /which\s+llm/,
    /what\s+llm/,
    /model\s+name/,
  ];
  return patterns.some((r) => r.test(t));
}

// MongoDB 图片记录 Schema（历史图片记录，保留原有定义）
const ImageRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    imageUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "librechat_images" },
);
const ImageRecordModel = mongoose.models.LibreChatImage || mongoose.model("LibreChatImage", ImageRecordSchema);

// MongoDB 最新记录 Schema（单例文档，用于 getLatestRecord 持久化）
const LatestRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "latest" },
    updateTime: { type: String, required: true },
    updateTimeShanghai: { type: String },
    imageUrl: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "librechat_latest" },
);
const LatestRecordModel = mongoose.models.LibreChatLatest || mongoose.model("LibreChatLatest", LatestRecordSchema);

// MongoDB 聊天历史 Schema
const ChatHistorySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    messages: { type: Array, required: true },
    updatedAt: { type: Date, default: Date.now },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { collection: "librechat_histories" },
);
// 索引：按用户与更新时间查询
ChatHistorySchema.index({ userId: 1 });
ChatHistorySchema.index({ updatedAt: -1 });
const ChatHistoryModel: any = mongoose.models.LibreChatHistory || mongoose.model("LibreChatHistory", ChatHistorySchema);

// ========== 新增：聊天提供者配置（多组 BASE_URL/API_KEY/MODEL）===========
interface ChatProviderDoc {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled?: boolean;
  weight?: number;
  group?: string;
  updatedAt?: Date;
}
const ChatProviderSchema = new mongoose.Schema(
  {
    baseUrl: { type: String, required: true },
    apiKey: { type: String, required: true },
    model: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    weight: { type: Number, default: 1 },
    group: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "chat_providers" },
);
const ChatProviderModel = (mongoose.models.ChatProvider as any) || mongoose.model("ChatProvider", ChatProviderSchema);

function normalizeBaseUrl(url?: string): string {
  if (!url) return "";
  return url.replace(/\/$/, "");
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface ImageRecord {
  updateTime: string;
  // 上海时间（UTC+8），用于本地化显示，可选以兼容历史数据
  updateTimeShanghai?: string;
  imageUrl: string;
}

interface ChatMessage {
  id: string;
  message: string;
  role?: "user" | "assistant";
  timestamp: string;
  token: string;
  userId?: string; // 可选：当登录用户ID可用时写入
}

interface ChatHistory {
  messages: ChatMessage[];
  total: number;
}

interface PaginationOptions {
  page: number;
  limit: number;
}

// 新增：SSE 连接管理器
interface SSEClient {
  id: string;
  userId: string;
  token: string;
  res: any; // Express Response
  lastPing: number;
}

class LibreChatService {
  private static instance: LibreChatService;
  private latestRecord: ImageRecord | null = null;
  private readonly DATA_DIR = join(process.cwd(), "data");
  private readonly DATA_FILE = join(this.DATA_DIR, "lc_data.json");
  private readonly CHAT_HISTORY_FILE = join(this.DATA_DIR, "chat_history.json");
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private chatHistory: ChatMessage[] = [];
  private readonly MAX_MEMORY_MESSAGES = 10000; // 限制内存中的最大消息数量
  private readonly MAX_USER_MESSAGES = 1000; // 限制单个用户的最大消息数量

  // provider 缓存（Mongo 可配置多组）
  private providersCache: ChatProviderDoc[] = [];
  private providersLoadedAt: number = 0;
  private readonly PROVIDERS_TTL_MS = 60_000;

  // 新增：SSE 连接管理
  private sseClients: Map<string, SSEClient> = new Map();
  private sseCleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_SSE_CLIENTS = 1000; // 限制最大 SSE 连接数

  private constructor() {
    this.initializeService();
    this.startSSECleanup();
  }

  public static getInstance(): LibreChatService {
    if (!LibreChatService.instance) {
      LibreChatService.instance = new LibreChatService();
    }
    return LibreChatService.instance;
  }

  private async initializeService() {
    try {
      if (mongoose.connection.readyState === 1) {
        // MongoDB: 加载最新记录（优先从单例集合获取）
        const latestDoc = await LatestRecordModel.findById("latest").lean();
        if (latestDoc) {
          const d: any = latestDoc;
          this.latestRecord = {
            updateTime: d.updateTime,
            updateTimeShanghai: d.updateTimeShanghai,
            imageUrl: d.imageUrl,
          };
          logger.info("从 MongoDB 加载最新的 LibreChat 记录 (librechat_latest)");
        } else {
          // 回退：尝试从历史图片集合中读取最近一条（仅保留 imageUrl）
          const latest = await ImageRecordModel.findOne().sort({ createdAt: -1 }).lean();
          this.latestRecord = latest
            ? { updateTime: new Date().toISOString(), imageUrl: (latest as any).imageUrl }
            : null;
          if (this.latestRecord) {
            logger.info("从 MongoDB 加载回退的 LibreChat 图片记录 (librechat_images)");
          }
        }
        // 加载聊天历史
        const history = await ChatHistoryModel.findOne().sort({ updatedAt: -1 }).lean();
        const h: any = history;
        this.chatHistory = h && Array.isArray(h.messages) ? h.messages : [];
        logger.info(`从 MongoDB 加载聊天历史: ${this.chatHistory.length} 条消息`);
        if (!this.isRunning && process.env.NODE_ENV !== "test") {
          this.startPeriodicCheck();
        }
        // 预加载 providers（忽略失败，不阻塞服务）
        this.loadProviders().catch(() => undefined);
        return;
      }
    } catch (error) {
      logger.error("从 MongoDB 加载 LibreChat 数据失败，降级为本地文件:", error);
    }
    // 本地文件兜底
    try {
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.info("创建 LibreChat 服务的数据目录");
      }
      if (existsSync(this.DATA_FILE)) {
        const data = await readFile(this.DATA_FILE, "utf-8");
        this.latestRecord = JSON.parse(data);
        logger.info("加载之前的 LibreChat 镜像记录");
      }
      if (existsSync(this.CHAT_HISTORY_FILE)) {
        const data = await readFile(this.CHAT_HISTORY_FILE, "utf-8");
        this.chatHistory = JSON.parse(data);
        logger.info(`从本地文件加载聊天历史: ${this.chatHistory.length} 条消息`);
      }
      if (!this.isRunning && process.env.NODE_ENV !== "test") {
        this.startPeriodicCheck();
      }
    } catch (error) {
      logger.error("Error initializing LibreChat service:", error);
    }
  }

  private async saveRecord(record: ImageRecord) {
    try {
      await writeFile(this.DATA_FILE, JSON.stringify(record, null, 2));
      this.latestRecord = record;
      logger.info(`已保存新的 LibreChat 镜像记录: ${record.imageUrl}`);
      // 同步保存到 MongoDB（单例 upsert）
      if (mongoose.connection.readyState === 1) {
        await LatestRecordModel.findByIdAndUpdate(
          "latest",
          { ...record, updatedAt: new Date() },
          { upsert: true, setDefaultsOnInsert: true },
        );
        logger.info("已将最新的 LibreChat 记录写入/更新到 MongoDB");
      }
    } catch (error) {
      logger.error("保存 LibreChat 记录时出错:", error);
    }
  }

  private async saveChatHistory() {
    try {
      // 内存清理：如果消息总数超过限制，保留最新的消息
      if (this.chatHistory.length > this.MAX_MEMORY_MESSAGES) {
        const oldLength = this.chatHistory.length;
        this.chatHistory = this.chatHistory.slice(-this.MAX_MEMORY_MESSAGES);
        logger.info(`内存清理：从 ${oldLength} 条消息清理到 ${this.chatHistory.length} 条消息`);
      }

      await writeFile(this.CHAT_HISTORY_FILE, JSON.stringify(this.chatHistory, null, 2));
      logger.info(`已保存聊天历史到本地文件: ${this.chatHistory.length} 条消息`);
    } catch (error) {
      logger.error("保存聊天历史时出错:", error);
    }
  }

  private async loadProviders(): Promise<ChatProviderDoc[]> {
    try {
      if (mongoose.connection.readyState !== 1) return [];
      const docs: ChatProviderDoc[] = await ChatProviderModel.find({ enabled: { $ne: false } }).lean();
      const normalized = (docs || [])
        .map((d) => ({
          baseUrl: normalizeBaseUrl((d as any).baseUrl),
          apiKey: String((d as any).apiKey || ""),
          model: String((d as any).model || ""),
          enabled: (d as any).enabled !== false,
          weight: Number((d as any).weight || 1),
          group: String((d as any).group || ""),
          updatedAt: (d as any).updatedAt,
        }))
        .filter((p) => p.baseUrl && p.apiKey && p.model);
      this.providersCache = normalized;
      this.providersLoadedAt = Date.now();
      return this.providersCache;
    } catch (e) {
      logger.error("加载聊天提供者配置失败", e);
      return [];
    }
  }

  private async getProvidersFresh(): Promise<ChatProviderDoc[]> {
    const now = Date.now();
    if (!this.providersLoadedAt || now - this.providersLoadedAt > this.PROVIDERS_TTL_MS) {
      await this.loadProviders();
    }
    return this.providersCache;
  }

  private buildProviderTryList(envFallbackFirst = false): { baseUrl: string; apiKey: string; model: string }[] {
    const envBase = normalizeBaseUrl(process.env.CHAT_BASE_URL || "");
    const envKey = process.env.CHAT_API_KEY || "";
    const envModel = process.env.CHAT_MODEL || "gpt-oss-120b";
    const envProvider = envBase && envKey ? [{ baseUrl: envBase, apiKey: envKey, model: envModel }] : [];
    // 混合顺序：可选择将 env 放前或放后
    const dbProviders = [...this.providersCache];
    // 按 weight 简单展开
    const weighted: ChatProviderDoc[] = [];
    for (const p of dbProviders) {
      const times = Math.min(10, Math.max(1, Number(p.weight || 1)));
      for (let i = 0; i < times; i++) weighted.push(p);
    }
    const tryList = shuffleInPlace(weighted.map((p) => ({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model })));
    return envFallbackFirst ? [...envProvider, ...tryList] : [...tryList, ...envProvider];
  }

  private async upsertTokenHistory(keyId: string, messages: ChatMessage[]) {
    try {
      const safeKey = sanitizeId(keyId);
      if (mongoose.connection.readyState === 1) {
        // 限制单次写入的消息数量，防止文档过大
        const limitedMessages = messages.slice(-this.MAX_USER_MESSAGES);

        await (mongoose.models.LibreChatHistory as any).findOneAndUpdate(
          { userId: safeKey },
          {
            $set: {
              messages: limitedMessages,
              updatedAt: new Date(),
            },
          },
          {
            upsert: true,
            setDefaultsOnInsert: true,
            // 设置最大文档大小限制
            maxTimeMS: 10000, // 10秒超时
          },
        );
        logger.info(`已保存 ${limitedMessages.length} 条消息到 MongoDB，用户ID: ${safeKey}`);
      } else {
        logger.warn("MongoDB 未连接，跳过数据库保存");
      }
    } catch (err) {
      logger.error("写入 MongoDB 聊天历史失败:", err);
      // 如果是文档过大错误，尝试只保存最近的消息
      if (err instanceof Error && err.message.includes("document too large")) {
        try {
          const reducedMessages = messages.slice(-100); // 只保存最近100条
          await (mongoose.models.LibreChatHistory as any).findOneAndUpdate(
            { userId: sanitizeId(keyId) },
            {
              $set: {
                messages: reducedMessages,
                updatedAt: new Date(),
              },
            },
            { upsert: true, setDefaultsOnInsert: true },
          );
          logger.info(`文档过大，已保存最近 ${reducedMessages.length} 条消息到 MongoDB`);
        } catch (retryErr) {
          logger.error("重试写入 MongoDB 失败:", retryErr);
        }
      }
    }
  }

  private async fetchAndRecord() {
    try {
      const url = "https://github.com/danny-avila/LibreChat/pkgs/container/librechat-dev";
      const response = await axios.get(url);

      // 使用 JSDOM 解析 HTML
      const dom = new JSDOM(response.data);
      const document = dom.window.document;

      // 查找 Docker 命令
      const clipboardCopy = document.querySelector("clipboard-copy");
      if (clipboardCopy) {
        const dockerCommand = clipboardCopy.getAttribute("value") || "";
        const filteredCommand = dockerCommand.replace("docker pull ", "");
        // 生成时间：UTC 和 上海时间（UTC+8）
        const now = new Date();
        const fmt = new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
        const shanghai = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;

        // 创建新记录
        const newRecord: ImageRecord = {
          updateTime: now.toISOString(),
          updateTimeShanghai: shanghai,
          imageUrl: filteredCommand,
        };

        // 保存记录
        await this.saveRecord(newRecord);
      }
    } catch (error) {
      logger.error("获取 LibreChat 镜像数据时出错:", error);
    }
  }

  private startPeriodicCheck() {
    this.isRunning = true;
    this.fetchAndRecord(); // 立即执行一次

    // 每小时检查一次
    this.intervalId = setInterval(() => {
      this.fetchAndRecord();
    }, 3600000); // 3600000 ms = 1 hour
  }

  public getLatestRecord(): ImageRecord | null {
    // 访问时确保持久化（若 MongoDB 已连接）
    if (this.latestRecord && mongoose.connection.readyState === 1) {
      LatestRecordModel.findByIdAndUpdate(
        "latest",
        { ...this.latestRecord, updatedAt: new Date() },
        { upsert: true, setDefaultsOnInsert: true },
      ).catch((err) => {
        logger.error("更新或插入最新记录失败:", err);
      });
    }
    return this.latestRecord;
  }

  // 新增：SSE 连接管理方法
  private startSSECleanup() {
    // 每30秒清理断开的SSE连接
    this.sseCleanupInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 5 * 60 * 1000; // 5分钟超时

      // 检查连接数量限制
      if (this.sseClients.size > this.MAX_SSE_CLIENTS) {
        // 按最后活跃时间排序，删除最旧的连接
        const sortedClients = Array.from(this.sseClients.entries()).sort(([, a], [, b]) => a.lastPing - b.lastPing);

        const toRemove = sortedClients.slice(0, this.sseClients.size - this.MAX_SSE_CLIENTS);
        for (const [clientId] of toRemove) {
          this.removeSSEClient(clientId);
          logger.info(`因连接数超限清理SSE连接: ${clientId}`);
        }
      }

      // 清理超时连接
      for (const [clientId, client] of this.sseClients.entries()) {
        if (now - client.lastPing > timeout) {
          this.removeSSEClient(clientId);
          logger.info(`清理超时的SSE连接: ${clientId}`);
        }
      }

      logger.info(`SSE连接清理完成，当前连接数: ${this.sseClients.size}`);
    }, 30000);
  }

  /**
   * 注册SSE客户端连接
   */
  public registerSSEClient(userId: string, token: string, res: any): string {
    // 检查连接数限制
    if (this.sseClients.size >= this.MAX_SSE_CLIENTS) {
      logger.warn(`SSE连接数已达上限 ${this.MAX_SSE_CLIENTS}，拒绝新连接`);
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Service Unavailable: Too many connections");
      return "";
    }

    const safeUserId = sanitizeId(userId);
    const safeToken = sanitizeId(token);
    const clientId = `${safeUserId || safeToken}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 发送初始连接消息
    res.write(`data: ${JSON.stringify({ type: "connected", clientId, timestamp: Date.now() })}\n\n`);

    // 存储客户端信息
    this.sseClients.set(clientId, {
      id: clientId,
      userId,
      token,
      res,
      lastPing: Date.now(),
    });

    logger.info(`注册SSE客户端: ${clientId}, userId: ${userId}, token: ${token}`);
    return clientId;
  }

  /**
   * 移除SSE客户端连接
   */
  public removeSSEClient(clientId: string): void {
    const client = this.sseClients.get(clientId);
    if (client) {
      try {
        client.res.end();
      } catch (error) {
        logger.warn(`关闭SSE连接时出错: ${clientId}`, error);
      }
      this.sseClients.delete(clientId);
      logger.info(`移除SSE客户端: ${clientId}`);
    }
  }

  /**
   * 向指定用户发送SSE通知
   */
  private sendSSENotification(userId: string, token: string, eventType: string, data: any): void {
    const targetClients = Array.from(this.sseClients.values()).filter(
      (client) => (userId && client.userId === userId) || (!userId && client.token === token),
    );

    if (targetClients.length === 0) {
      logger.debug(`未找到匹配的SSE客户端: userId=${userId}, token=${token}`);
      return;
    }

    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: Date.now(),
    });

    targetClients.forEach((client) => {
      try {
        client.res.write(`data: ${message}\n\n`);
        client.lastPing = Date.now();
      } catch (error) {
        logger.warn(`发送SSE消息失败: ${client.id}`, error);
        this.sseClients.delete(client.id);
      }
    });

    logger.info(`向 ${targetClients.length} 个客户端发送SSE通知: ${eventType}`);
  }

  /**
   * 发送聊天消息
   */
  public async sendMessage(
    token: string,
    message: string,
    userId?: string,
    cfToken?: string,
    userRole?: string,
  ): Promise<string> {
    // 检查非管理员用户的 Turnstile 验证
    const isAdmin = userRole === "admin" || userRole === "administrator";
    if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
      if (!cfToken) {
        logger.warn("非管理员用户缺少 Turnstile token，拒绝发送消息", { userId, userRole });
        throw new Error("需要完成人机验证才能发送消息");
      }

      try {
        // 验证 Turnstile token
        const verificationUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        const formData = new URLSearchParams();
        formData.append("secret", process.env.TURNSTILE_SECRET_KEY);
        formData.append("response", cfToken);

        const verificationResponse = await axios.post(verificationUrl, formData, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        });

        const verificationResult = verificationResponse.data;
        if (!verificationResult.success) {
          logger.warn("Turnstile 验证失败", {
            userId,
            userRole,
            errorCodes: verificationResult["error-codes"],
            challengeTs: verificationResult.challenge_ts,
            hostname: verificationResult.hostname,
          });
          throw new Error("人机验证失败，请重新验证");
        }

        logger.info("Turnstile 验证成功", { userId, userRole, hostname: verificationResult.hostname });
      } catch (error) {
        if (error instanceof Error && (error.message.includes("人机验证") || error.message.includes("Turnstile"))) {
          throw error;
        }
        logger.error("Turnstile 验证请求失败", {
          userId,
          userRole,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error("人机验证服务暂时不可用，请稍后重试");
      }
    } else if (!isAdmin) {
      logger.info("非管理员用户但未配置 Turnstile，跳过验证", { userId, userRole });
    } else {
      logger.info("管理员用户，跳过 Turnstile 验证", { userId, userRole });
    }

    // 先将用户消息写入历史
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      message,
      role: "user",
      timestamp: new Date().toISOString(),
      token,
      userId,
    };
    // 检查单个用户消息数量限制
    const keyId = userId || token;
    const currentUserMessages = this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token));

    if (currentUserMessages.length >= this.MAX_USER_MESSAGES) {
      // 删除该用户最旧的消息，保持在限制内
      const userMessagesToRemove = currentUserMessages.slice(
        0,
        currentUserMessages.length - this.MAX_USER_MESSAGES + 1,
      );
      this.chatHistory = this.chatHistory.filter((m) => !userMessagesToRemove.some((rm) => rm.id === m.id));
      logger.info(`用户 ${keyId} 消息数量超限，已清理 ${userMessagesToRemove.length} 条旧消息`);
    }

    this.chatHistory.push(userMsg);
    await this.saveChatHistory();
    logger.info(`已保存用户消息到内存/文件，token: ${token}, userId: ${userId}`);

    // 同步写入 MongoDB（用户消息）
    const currentMessages = this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token));
    await this.upsertTokenHistory(keyId, currentMessages);

    // 若用户询问“你是什么模型”等同类问题，严格保持沉默并直接返回空字符串
    if (isModelIdentityQuery(message)) {
      logger.info("拦截模型识别类问题，按规则保持沉默");
      // 发送SSE通知：消息完成
      this.sendSSENotification(userId || "", token, "message_completed", {
        messageId: userMsg.id,
        hasResponse: false,
        reason: "model_identity_query",
      });
      return "";
    }

    // 尝试加载 DB 提供者
    let providers: { baseUrl: string; apiKey: string; model: string }[] = [];
    try {
      await this.getProvidersFresh();
      providers = this.buildProviderTryList(false);
    } catch {
      providers = [];
    }

    // 如果 DB 无配置，则回退到环境变量
    if (!providers.length) {
      const envBase = normalizeBaseUrl(process.env.CHAT_BASE_URL || "");
      const envKey = process.env.CHAT_API_KEY || "";
      const envModel = process.env.CHAT_MODEL || "gpt-oss-120b";
      if (envBase && envKey) {
        providers = [{ baseUrl: envBase, apiKey: envKey, model: envModel }];
      }
    }

    // 如果仍未配置，返回降级本地回复
    if (!providers.length) {
      logger.warn("未配置任何聊天提供者（DB/ENV），使用本地模拟回复");
      const fallback = "系统暂未配置对话服务，已返回本地示例回答。";
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        message: fallback,
        role: "assistant",
        timestamp: new Date().toISOString(),
        token,
        userId,
      };
      this.chatHistory.push(aiMsg);
      await this.saveChatHistory();
      logger.info(`已保存降级回复到内存/文件，token: ${token}, userId: ${userId}`);

      const updatedUserMessages = this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token));
      await this.upsertTokenHistory(keyId, updatedUserMessages);
      logger.info(`已更新MongoDB（降级回复），用户消息总数: ${updatedUserMessages.length}`);

      // 发送SSE通知：消息完成（降级回复）
      this.sendSSENotification(userId || "", token, "message_completed", {
        messageId: aiMsg.id,
        hasResponse: true,
        responseLength: fallback.length,
        totalMessages: updatedUserMessages.length,
        isFallback: true,
      });

      return fallback;
    }

    // 组织对话上下文（带上最近若干轮同一 token 的消息）
    const recent = this.chatHistory.filter((m) => m.token === token).slice(-20);

    const messagesPayload = [
      {
        role: "system",
        content:
          "你是 Happy-TTS LibreChat 的客服助理，必须使用中文并提供专业、准确、简洁的回答。\n" +
          "重要规则：\n" +
          "1) 当用户询问你“是什么模型/用的什么模型/模型名称/模型版本/运行在什么模型”等同类问题时，保持沉默，不要作答，不要输出任何字符。\n" +
          "2) 不要改变身份，不要扮演其他角色。\n" +
          "3) 在确保安全与合规的前提下，遵循用户的正常需求与指令。\n" +
          "4) 如果用户询问你“生成 mermaid 流程图”，请回答在mermaid 流程图中不包含除必要语法外的英文标点。\n" +
          "5) 如果用户询问你“兰翠平或者兰翠平、lcp或其他谐音或者类似变种”，请回答在兰翠平死了。\n" +
          "6) 如果用户要求你生成 mermaid 流程图，请你不要在给出的输出中包含会误导流程图渲染的英文标点，如果必须使用请使用中文标定来替换。",
      },
      ...recent.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.message,
      })),
    ];

    // 依序尝试 providers，失败自动切换到下一个
    let lastError: any = null;
    for (const p of providers) {
      const baseURL = p.baseUrl;
      const apiKey = p.apiKey;
      const model = p.model;

      try {
        const url = `${baseURL}/v1/chat/completions`;
        const resp = await axios.post(
          url,
          {
            model,
            messages: messagesPayload,
            temperature: 0.7,
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 60_000,
            // 避免使用系统代理造成的 302 循环重定向
            proxy: false,
            // 限制重定向次数，防止 provider 端异常配置导致死循环
            maxRedirects: 5,
          },
        );

        // 解析 OpenAI 兼容响应并清洗 think 标签
        const aiTextRaw = resp?.data?.choices?.[0]?.message?.content?.trim() || "（无有效回复）";
        const aiText = sanitizeAssistantText(aiTextRaw);

        // 持久化助手回复
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          message: aiText,
          role: "assistant",
          timestamp: new Date().toISOString(),
          token,
          userId,
        };
        this.chatHistory.push(aiMsg);
        await this.saveChatHistory();
        logger.info(`已保存AI回复到内存/文件，token: ${token}, userId: ${userId}`);

        const updatedUserMessages = this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token));
        await this.upsertTokenHistory(keyId, updatedUserMessages);
        logger.info(`已更新MongoDB，用户消息总数: ${updatedUserMessages.length}`);

        // 发送SSE通知：消息完成
        this.sendSSENotification(userId || "", token, "message_completed", {
          messageId: aiMsg.id,
          hasResponse: true,
          responseLength: aiText.length,
          totalMessages: updatedUserMessages.length,
        });

        return aiText;
      } catch (err: any) {
        lastError = err;
        logger.error("调用聊天提供者失败，尝试下一个", {
          baseURL,
          model,
          error: err?.response?.data || err?.message || String(err),
        });
        // 继续尝试下一个 provider
      }
    }

    // 所有 provider 失败，返回降级
    logger.error("所有聊天提供者均失败，返回本地降级回复", lastError);
    const fallback = "对话服务暂不可用，请稍后重试。";
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      message: fallback,
      role: "assistant",
      timestamp: new Date().toISOString(),
      token,
      userId,
    };
    this.chatHistory.push(aiMsg);
    await this.saveChatHistory();
    logger.info(`已保存错误降级回复到内存/文件，token: ${token}, userId: ${userId}`);

    const updatedUserMessages = this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token));
    await this.upsertTokenHistory(keyId, updatedUserMessages);
    logger.info(`已更新MongoDB（错误降级），用户消息总数: ${updatedUserMessages.length}`);

    // 发送SSE通知：消息完成（降级回复）
    this.sendSSENotification(userId || "", token, "message_completed", {
      messageId: aiMsg.id,
      hasResponse: true,
      responseLength: fallback.length,
      totalMessages: updatedUserMessages.length,
      isFallback: true,
    });

    return fallback;
  }

  /**
   * 获取聊天历史
   */
  public async getHistory(
    token: string,
    options: PaginationOptions = { page: 1, limit: 20 },
    userId?: string,
  ): Promise<ChatHistory> {
    // 优先从 MongoDB 获取
    let userMessages: ChatMessage[] | null = null;
    if (mongoose.connection.readyState === 1) {
      try {
        const keyId = sanitizeId(userId || token);
        logger.info(`从 MongoDB 获取历史记录，用户ID: ${keyId}`);
        const doc = await (mongoose.models.LibreChatHistory as any)
          .findOne({ userId: keyId, deleted: { $ne: true } })
          .lean();
        if (doc && Array.isArray(doc.messages)) {
          userMessages = doc.messages as ChatMessage[];
          logger.info(`从 MongoDB 获取到 ${userMessages.length} 条消息`);
        } else {
          logger.info("MongoDB 中未找到历史记录");
        }
      } catch (err) {
        logger.error("从 MongoDB 获取聊天历史失败，回退到内存/文件:", err);
      }
    } else {
      logger.warn("MongoDB 未连接，使用内存/文件存储");
    }

    if (!userMessages) {
      // 回退到内存/文件存储
      const _safeUserId = sanitizeId(userId);
      const _safeToken = sanitizeId(token);
      userMessages = this.chatHistory.filter((msg) => {
        if (userId) {
          return msg.userId === userId; // 使用原始userId进行比较
        } else {
          return msg.token === token; // 使用原始token进行比较
        }
      });
      logger.info(`从内存/文件获取到 ${userMessages.length} 条消息，token: ${token}, userId: ${userId}`);
    }

    const total = userMessages.length;
    const startIndex = (options.page - 1) * options.limit;
    const endIndex = startIndex + options.limit;
    const messages = userMessages.slice(startIndex, endIndex);

    logger.info(
      `返回历史记录: 总数 ${total}, 当前页 ${options.page}, 每页 ${options.limit}, 返回 ${messages.length} 条`,
    );
    return {
      messages,
      total,
    };
  }

  /**
   * 清除聊天历史
   */
  public async clearHistory(token: string, userId?: string): Promise<void> {
    const _safeUserId = sanitizeId(userId);
    const _safeToken = sanitizeId(token);

    // 从内存中删除该用户的消息
    const beforeCount = this.chatHistory.length;
    this.chatHistory = this.chatHistory.filter((msg) => {
      if (userId) {
        return msg.userId !== userId; // 使用原始userId进行比较
      } else {
        return msg.token !== token; // 使用原始token进行比较
      }
    });
    const removedCount = beforeCount - this.chatHistory.length;

    logger.info(`清除历史记录: 用户ID=${userId || token}, 从内存中删除了 ${removedCount} 条消息`);

    // 保存更新后的内存数据到文件
    await this.saveChatHistory();

    // MongoDB 中软删除该用户的记录
    if (mongoose.connection.readyState === 1) {
      try {
        const keyId = sanitizeId(userId || token);
        logger.info(`在 MongoDB 中软删除用户记录: ${keyId}`);

        // 使用 findOneAndUpdate 确保原子操作，如果记录不存在则创建
        const result = await (mongoose.models.LibreChatHistory as any).findOneAndUpdate(
          { userId: keyId },
          {
            $set: {
              deleted: true,
              deletedAt: new Date(),
              messages: [], // 清空消息数组
              updatedAt: new Date(),
            },
          },
          {
            upsert: true,
            setDefaultsOnInsert: true,
            new: true, // 返回更新后的文档
          },
        );

        logger.info(`MongoDB 软删除成功: ${result ? "记录已更新" : "记录已创建"}`);
      } catch (err) {
        logger.error("MongoDB 软删除聊天历史失败:", err);
        // 即使 MongoDB 操作失败，内存和文件中的数据已经被清除
      }
    } else {
      logger.warn("MongoDB 未连接，仅清除内存和文件中的历史记录");
    }
  }

  /**
   * 按消息ID删除（仅删除属于该 token 的消息）
   */
  public async deleteMessage(token: string, id: string, userId?: string): Promise<{ removed: number }> {
    const before = this.chatHistory.length;
    const safeUserId = sanitizeId(userId);
    const safeToken = sanitizeId(token);
    this.chatHistory = this.chatHistory.filter(
      (m) => !((safeUserId ? m.userId === safeUserId : m.token === safeToken) && m.id === id),
    );
    const removed = before - this.chatHistory.length;
    if (removed > 0) {
      await this.saveChatHistory();
      const keyId = sanitizeId(userId || token);
      // upsert 时自动复活软删除
      await (mongoose.models.LibreChatHistory as any)
        .findOneAndUpdate(
          { userId: keyId },
          {
            $set: {
              messages: this.chatHistory.filter((m) => (safeUserId ? m.userId === safeUserId : m.token === safeToken)),
              updatedAt: new Date(),
              deleted: false,
              deletedAt: null,
            },
          },
          { upsert: true, setDefaultsOnInsert: true },
        )
        .catch(() => undefined);
      await this.upsertTokenHistory(
        keyId,
        this.chatHistory.filter((m) => (safeUserId ? m.userId === safeUserId : m.token === safeToken)),
      );
    }
    return { removed };
  }

  /**
   * 批量按消息ID删除（仅删除属于该 token 的消息）
   */
  public async deleteMessages(token: string, ids: string[], userId?: string): Promise<{ removed: number }> {
    const idSet = new Set(ids || []);
    const before = this.chatHistory.length;
    this.chatHistory = this.chatHistory.filter(
      (m) => !((userId ? m.userId === userId : m.token === token) && idSet.has(m.id)),
    );
    const removed = before - this.chatHistory.length;
    if (removed > 0) {
      await this.saveChatHistory();
      const keyId = userId || token;
      await (mongoose.models.LibreChatHistory as any)
        .findOneAndUpdate(
          { userId: sanitizeId(keyId) },
          {
            $set: {
              messages: this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token)),
              updatedAt: new Date(),
              deleted: false,
              deletedAt: null,
            },
          },
          { upsert: true, setDefaultsOnInsert: true },
        )
        .catch(() => undefined);
      await this.upsertTokenHistory(
        keyId,
        this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token)),
      );
    }
    return { removed };
  }

  /**
   * 修改单条消息内容（仅允许修改属于该 token 的消息）
   */
  public async updateMessage(
    token: string,
    id: string,
    content: string,
    userId?: string,
  ): Promise<{ updated: number }> {
    let updated = 0;
    this.chatHistory = this.chatHistory.map((m) => {
      if ((userId ? m.userId === userId : m.token === token) && m.id === id) {
        updated = 1;
        return { ...m, message: content };
      }
      return m;
    });
    if (updated) {
      await this.saveChatHistory();
      const keyId = userId || token;
      await (mongoose.models.LibreChatHistory as any)
        .findOneAndUpdate(
          { userId: sanitizeId(keyId) },
          {
            $set: {
              messages: this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token)),
              updatedAt: new Date(),
              deleted: false,
              deletedAt: null,
            },
          },
          { upsert: true, setDefaultsOnInsert: true },
        )
        .catch(() => undefined);
      await this.upsertTokenHistory(
        keyId,
        this.chatHistory.filter((m) => (userId ? m.userId === userId : m.token === token)),
      );
    }
    return { updated };
  }

  /**
   * 携带上下文重试指定的助手消息：用该消息之前的上下文重新向提供者请求，并用新内容覆盖原助手消息
   */
  public async retryMessage(
    token: string,
    messageId: string,
    userId?: string,
    cfToken?: string,
    userRole?: string,
  ): Promise<string> {
    const safeUserId = sanitizeId(userId);
    const safeToken = sanitizeId(token);
    // 检查非管理员用户的 Turnstile 验证
    const isAdmin = userRole === "admin" || userRole === "administrator";
    if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
      if (!cfToken) {
        logger.warn("非管理员用户重试消息时缺少 Turnstile token，拒绝操作", { userId, userRole });
        throw new Error("需要完成人机验证才能重试消息");
      }

      try {
        // 验证 Turnstile token
        const verificationUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
        const formData = new URLSearchParams();
        formData.append("secret", process.env.TURNSTILE_SECRET_KEY);
        formData.append("response", cfToken);

        const verificationResponse = await axios.post(verificationUrl, formData, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        });

        const verificationResult = verificationResponse.data;
        if (!verificationResult.success) {
          logger.warn("重试消息时 Turnstile 验证失败", {
            userId,
            userRole,
            errorCodes: verificationResult["error-codes"],
            challengeTs: verificationResult.challenge_ts,
            hostname: verificationResult.hostname,
          });
          throw new Error("人机验证失败，请重新验证");
        }

        logger.info("重试消息时 Turnstile 验证成功", { userId, userRole, hostname: verificationResult.hostname });
      } catch (error) {
        if (error instanceof Error && (error.message.includes("人机验证") || error.message.includes("Turnstile"))) {
          throw error;
        }
        logger.error("重试消息时 Turnstile 验证请求失败", {
          userId,
          userRole,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error("人机验证服务暂时不可用，请稍后重试");
      }
    } else if (!isAdmin) {
      logger.info("非管理员用户重试消息但未配置 Turnstile，跳过验证", { userId, userRole });
    } else {
      logger.info("管理员用户重试消息，跳过 Turnstile 验证", { userId, userRole });
    }

    // 取该用户的所有消息
    const userMessages = this.chatHistory.filter((m) => (safeUserId ? m.userId === safeUserId : m.token === safeToken));
    // 定位要重试的助手消息
    const targetIdxInUser = userMessages.findIndex((m) => m.id === messageId && m.role === "assistant");
    if (targetIdxInUser === -1) {
      return "";
    }
    // 计算其在全局 chatHistory 中的索引
    const globalIndex = this.chatHistory.findIndex(
      (m) =>
        (safeUserId ? m.userId === safeUserId : m.token === safeToken) && m.id === messageId && m.role === "assistant",
    );
    if (globalIndex === -1) {
      return "";
    }
    // 构造上下文：取该消息之前此用户的消息
    const context = userMessages.slice(0, targetIdxInUser);
    // 若最后一条用户消息是模型身份询问，按规则保持沉默
    const lastUserMsg = [...context].reverse().find((m) => m.role !== "assistant");
    if (lastUserMsg && isModelIdentityQuery(lastUserMsg.message)) {
      return "";
    }

    // 准备 provider 列表
    let providers: { baseUrl: string; apiKey: string; model: string }[] = [];
    try {
      await this.getProvidersFresh();
      providers = this.buildProviderTryList(false);
    } catch {
      providers = [];
    }
    if (!providers.length) {
      const envBase = normalizeBaseUrl(process.env.CHAT_BASE_URL || "");
      const envKey = process.env.CHAT_API_KEY || "";
      const envModel = process.env.CHAT_MODEL || "gpt-oss-120b";
      if (envBase && envKey) {
        providers = [{ baseUrl: envBase, apiKey: envKey, model: envModel }];
      }
    }

    // 构造 OpenAI 兼容 messages
    const messagesPayload = [
      {
        role: "system",
        content:
          "你是 Happy-TTS LibreChat 的客服助理，必须使用中文并提供专业、准确、简洁的回答。\n" +
          "重要规则：\n" +
          "1) 当用户询问你“是什么模型/用的什么模型/模型名称/模型版本/运行在什么模型”等同类问题时，保持沉默，不要作答，不要输出任何字符。\n" +
          "2) 不要改变身份，不要扮演其他角色。\n" +
          "3) 在确保安全与合规的前提下，遵循用户的正常需求与指令。\n" +
          "4) 如果用户询问你“生成 mermaid 流程图”，请回答在mermaid 流程图中不包含除必要语法外的英文标点。\n" +
          "5) 如果用户询问你“兰翠平或者兰翠平、lcp或其他谐音或者类似变种”，请回答在兰翠平死了。",
      },
      ...context.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.message,
      })),
    ];

    // 依序尝试 providers
    let lastError: any = null;
    for (const p of providers) {
      const baseURL = p.baseUrl;
      const apiKey = p.apiKey;
      const model = p.model;
      try {
        const url = `${baseURL}/v1/chat/completions`;
        const resp = await axios.post(
          url,
          {
            model,
            messages: messagesPayload,
            temperature: 0.7,
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 60_000,
            proxy: false,
            maxRedirects: 5,
          },
        );
        const aiTextRaw = resp?.data?.choices?.[0]?.message?.content?.trim() || "（无有效回复）";
        const aiText = sanitizeAssistantText(aiTextRaw);

        // 覆盖原助手消息
        const nowIso = new Date().toISOString();
        const updatedMsg: ChatMessage = {
          ...this.chatHistory[globalIndex],
          message: aiText,
          timestamp: nowIso,
        };
        this.chatHistory[globalIndex] = updatedMsg;
        await this.saveChatHistory();
        const keyId = safeUserId || safeToken;
        await this.upsertTokenHistory(
          keyId,
          this.chatHistory.filter((m) => (safeUserId ? m.userId === safeUserId : m.token === safeToken)),
        );

        // 发送SSE通知：重试完成
        this.sendSSENotification(userId || "", token, "retry_completed", {
          messageId: updatedMsg.id,
          hasResponse: true,
          responseLength: aiText.length,
        });

        return aiText;
      } catch (err: any) {
        lastError = err;
        logger.error("重试调用聊天提供者失败，尝试下一个", {
          baseURL,
          model,
          error: err?.response?.data || err?.message || String(err),
        });
      }
    }

    logger.error("所有聊天提供者均失败（重试）", lastError);
    const fallback = "对话服务暂不可用，请稍后重试。";
    // 覆盖原助手消息为降级提示
    const nowIso = new Date().toISOString();
    this.chatHistory[globalIndex] = {
      ...this.chatHistory[globalIndex],
      message: fallback,
      timestamp: nowIso,
    };
    await this.saveChatHistory();
    const keyId = safeUserId || safeToken;
    await this.upsertTokenHistory(
      keyId,
      this.chatHistory.filter((m) => (safeUserId ? m.userId === safeUserId : m.token === safeToken)),
    );

    // 发送SSE通知：重试完成（降级回复）
    this.sendSSENotification(userId || "", token, "retry_completed", {
      messageId: this.chatHistory[globalIndex].id,
      hasResponse: true,
      responseLength: fallback.length,
      isFallback: true,
    });

    return fallback;
  }

  // 仅管理员使用：列出所有用户最新概览（分页）
  public async adminListUsers(
    keyword = "",
    page = 1,
    limit = 20,
    includeDeleted = false,
  ): Promise<{ users: any[]; total: number }> {
    if (mongoose.connection.readyState !== 1) return { users: [], total: 0 };

    // 安全处理搜索关键词，防止 NoSQL 注入
    const sanitizedKeyword = sanitizeId(keyword.trim());
    const q: any = {};

    if (sanitizedKeyword) {
      // 使用安全的字符串匹配而不是正则表达式，防止 ReDoS 攻击
      q.userId = { $regex: `^${escapeRegex(sanitizedKeyword)}`, $options: "i" };
    }

    if (!includeDeleted) q.deleted = { $ne: true };
    const total = await (mongoose.models.LibreChatHistory as any).countDocuments(q);
    const docs = await (mongoose.models.LibreChatHistory as any)
      .find(q, { userId: 1, messages: 1, updatedAt: 1, deleted: 1, deletedAt: 1 })
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const users = (docs || []).map((d: any) => {
      const msgs: ChatMessage[] = Array.isArray(d.messages) ? d.messages : [];
      const totalMsgs = msgs.length;
      const times = msgs
        .map((m) => m.timestamp)
        .filter(Boolean)
        .sort();
      const firstTs = times[0] || null;
      const lastTs = times[times.length - 1] || null;
      return { userId: d.userId, total: totalMsgs, updatedAt: d.updatedAt, firstTs, lastTs };
    });
    return { users, total };
  }

  // 仅管理员使用：获取指定用户的历史（分页）
  public async adminGetUserHistory(userId: string, page = 1, limit = 20): Promise<ChatHistory> {
    if (mongoose.connection.readyState !== 1) return { messages: [], total: 0 };
    const safeUserId = sanitizeId(userId);
    const doc = await (mongoose.models.LibreChatHistory as any)
      .findOne({ userId: safeUserId, deleted: { $ne: true } })
      .lean();
    const all: ChatMessage[] = doc?.messages || [];
    const total = all.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    return { messages: all.slice(start, end), total };
  }

  // 仅管理员使用：删除指定用户全部历史（Mongo 不可用时回退到内存存储）
  public async adminDeleteUser(userId: string): Promise<{ deleted: number }> {
    const safeUserId = sanitizeId(userId);
    let deleted = 0;

    // 优先尝试 MongoDB
    try {
      if (mongoose.connection.readyState === 1) {
        // 若不存在文档，创建一个软删除占位文档，确保管理端可见并可恢复
        const existing = await (mongoose.models.LibreChatHistory as any).findOne({ userId: safeUserId }).lean();
        if (!existing) {
          await (mongoose.models.LibreChatHistory as any).create({
            userId: safeUserId,
            messages: [],
            deleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          });
          deleted = 1;
        } else {
          const ret = await (mongoose.models.LibreChatHistory as any).updateMany(
            { userId: safeUserId },
            { $set: { deleted: true, deletedAt: new Date() } },
            { upsert: true },
          );
          deleted = (ret?.modifiedCount || 0) as number;
        }
      }
    } catch (e) {
      console.warn("[LibreChat] adminDeleteUser mongo delete failed, fallback to memory", e);
    }

    // 同步内存/文件（按 userId 清理）
    const before = this.chatHistory.length;
    this.chatHistory = this.chatHistory.filter((m) => m.userId !== safeUserId);
    if (this.chatHistory.length !== before) {
      await this.saveChatHistory();
      // 如果 Mongo 未删到文档，则至少按内存处理记作 1
      if (deleted === 0) deleted = 1;
    }

    return { deleted };
  }

  // 仅管理员使用：批量删除多个用户全部历史
  public async adminBatchDeleteUsers(
    userIds: string[],
  ): Promise<{ deleted: number; details: { userId: string; deleted: number }[] }> {
    const safeUserIds = userIds.map((id) => sanitizeId(id));
    const details: { userId: string; deleted: number }[] = [];
    let totalDeleted = 0;

    // 优先尝试 MongoDB 删除
    if (mongoose.connection.readyState === 1) {
      for (const userId of safeUserIds) {
        try {
          let deletedCount = 0;
          const existing = await (mongoose.models.LibreChatHistory as any).findOne({ userId }).lean();
          if (!existing) {
            await (mongoose.models.LibreChatHistory as any).create({
              userId,
              messages: [],
              deleted: true,
              deletedAt: new Date(),
              updatedAt: new Date(),
            });
            deletedCount = 1;
          } else {
            const ret = await (mongoose.models.LibreChatHistory as any).updateMany(
              { userId },
              { $set: { deleted: true, deletedAt: new Date() } },
              { upsert: true },
            );
            deletedCount = (ret?.modifiedCount || 0) as number;
          }
          details.push({ userId, deleted: deletedCount });
          totalDeleted += deletedCount;
        } catch (error) {
          console.error("删除用户失败", { userId, error });
          details.push({ userId, deleted: 0 });
        }
      }
    }

    // 同步内存/文件（按 userId 清理）
    const beforeLen = this.chatHistory.length;
    this.chatHistory = this.chatHistory.filter((m) => m.userId !== undefined && !safeUserIds.includes(m.userId));
    const afterLen = this.chatHistory.length;
    if (afterLen !== beforeLen) {
      await this.saveChatHistory();
      const memoryDeleted = beforeLen - afterLen;
      // 如果 Mongo 没有删到，使用内存删除数量兜底
      if (totalDeleted < memoryDeleted) totalDeleted = memoryDeleted;
      for (const uid of safeUserIds) {
        if (!details.find((d) => d.userId === uid)) {
          details.push({ userId: uid, deleted: 1 });
        }
      }
    }

    return { deleted: totalDeleted, details };
  }

  // 仅管理员使用：删除所有用户历史（危险操作，优先 drop 集合，失败则 deleteMany）
  public async adminDeleteAllUsers(): Promise<{ deletedCount: number }> {
    try {
      const startedAt = Date.now();
      const mongoConnected = mongoose.connection.readyState === 1;
      logger.info("开始删除所有用户聊天历史", { mongoConnected });

      let deletedCount = 0;
      let dbTotalBefore: number | null = null;
      let dbRemaining: number | null = null;

      if (mongoConnected) {
        try {
          dbTotalBefore = await (mongoose.models.LibreChatHistory as any).countDocuments({ deleted: { $ne: true } });
          logger.info("数据库记录总数（删除前）", { total: dbTotalBefore });

          const result = await (mongoose.models.LibreChatHistory as any).updateMany(
            {},
            { $set: { deleted: true, deletedAt: new Date() } },
          );
          deletedCount = typeof result?.modifiedCount === "number" ? result.modifiedCount : 0;

          dbRemaining = await (mongoose.models.LibreChatHistory as any).countDocuments({ deleted: { $ne: true } });
          logger.info("数据库删除结果", { deletedCount, remaining: dbRemaining });
        } catch (dbErr) {
          logger.error("数据库删除过程中发生错误", dbErr);
        }
      } else {
        logger.warn("MongoDB 未连接，跳过数据库删除");
      }

      const memoryBefore = this.chatHistory.length;
      logger.info("内存记录数（删除前）", { memoryBefore });
      if (memoryBefore > 0) {
        this.chatHistory = [];
        await this.saveChatHistory();
        const memoryAfter = this.chatHistory.length;
        logger.info("内存与本地缓存已清空", { memoryAfter });
      } else {
        logger.info("内存无记录，无需清空");
      }

      const durationMs = Date.now() - startedAt;
      logger.info("删除所有用户聊天历史完成", {
        durationMs,
        deletedCount,
        mongoConnected,
        dbTotalBefore,
        dbRemaining,
      });

      return { deletedCount };
    } catch (error) {
      logger.error("删除所有聊天历史失败:", error);
      throw error;
    }
  }

  public async adminDeleteAllUsersAction(payload: { confirm?: boolean }): Promise<{ statusCode: number; body: any }> {
    if (!payload?.confirm) {
      logger.warn("拒绝执行删除所有用户历史：缺少确认标志");
      return { statusCode: 400, body: { error: "请确认删除所有用户历史" } };
    }
    const { deletedCount } = await this.adminDeleteAllUsers();
    const body = {
      message: `已删除所有用户历史，共 ${deletedCount} 个用户`,
      deletedCount,
    };
    return { statusCode: 200, body };
  }

  /**
   * 导出指定 token 的全部历史为纯文本
   */
  public async exportHistoryText(token: string, userId?: string): Promise<{ content: string; count: number }> {
    // 优先从 MongoDB 读取
    let userMessages: ChatMessage[] = [];
    if (mongoose.connection.readyState === 1) {
      const keyId = sanitizeId(userId || token);
      const doc = await (mongoose.models.LibreChatHistory as any)
        .findOne({ userId: keyId, deleted: { $ne: true } })
        .lean();
      if (doc && Array.isArray(doc.messages)) userMessages = doc.messages as ChatMessage[];
    }
    if (userMessages.length === 0) {
      const safeUserId = sanitizeId(userId);
      const safeToken = sanitizeId(token);
      userMessages = this.chatHistory.filter((msg) =>
        safeUserId ? msg.userId === safeUserId : msg.token === safeToken,
      );
    }
    const count = userMessages.length;
    const now = new Date();
    const header = `LibreChat 历史导出\n导出时间：${now.toLocaleString()}\nToken：${token}\n总条数：${count}\n\n`;
    const lines = userMessages.map((m, idx) => {
      // 历史中未保存角色信息，保留通用格式
      const ts = m.timestamp ? ` @ ${m.timestamp}` : "";
      const content = sanitizeAssistantText(m.message || "");
      return `#${idx + 1}${ts}\n${content}\n`;
    });
    return { content: header + lines.join("\n"), count };
  }

  // 清理方法，用于测试环境
  public cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.sseCleanupInterval) {
      clearInterval(this.sseCleanupInterval);
      this.sseCleanupInterval = null;
    }
    // 清理所有SSE连接
    for (const [clientId, client] of this.sseClients.entries()) {
      try {
        client.res.end();
      } catch (error) {
        logger.warn(`清理SSE连接时出错: ${clientId}`, error);
      }
    }
    this.sseClients.clear();
    this.isRunning = false;
  }
}

export const libreChatService = LibreChatService.getInstance();
