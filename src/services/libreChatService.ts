import axios from 'axios';
import { JSDOM } from 'jsdom';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger';
import { mongoose } from '../services/mongoService';

// 清洗助手文本中的 <think> 思考内容与可视化标记
function sanitizeAssistantText(text: string): string {
  if (!text) return text;
  try {
    return text
      // 移除完整的 <think ...>...</think> 段落（允许属性，跨行）
      .replace(/<think\b[^>]*>[\s\S]*?<\/?think>/gi, '')
      // 兜底：去掉可能残留的起止标签（含空白）
      .replace(/<\/?\s*think\b[^>]*>/gi, '')
      // 去除常见的可视化标记行
      .replace(/^\s*(已深度思考|深度思考|Deep\s*Thinking)\b.*$/gmi, '')
      // 折叠多余空行
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
  return patterns.some(r => r.test(t));
}

// MongoDB 图片记录 Schema（历史图片记录，保留原有定义）
const ImageRecordSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'librechat_images' });
const ImageRecordModel = mongoose.models.LibreChatImage || mongoose.model('LibreChatImage', ImageRecordSchema);

// MongoDB 最新记录 Schema（单例文档，用于 getLatestRecord 持久化）
const LatestRecordSchema = new mongoose.Schema({
  _id: { type: String, default: 'latest' },
  updateTime: { type: String, required: true },
  updateTimeShanghai: { type: String },
  imageUrl: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'librechat_latest' });
const LatestRecordModel = mongoose.models.LibreChatLatest || mongoose.model('LibreChatLatest', LatestRecordSchema);

// MongoDB 聊天历史 Schema
const ChatHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  messages: { type: Array, required: true },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'librechat_histories' });
const ChatHistoryModel = mongoose.models.LibreChatHistory || mongoose.model('LibreChatHistory', ChatHistorySchema);

interface ImageRecord {
  updateTime: string;
  // 上海时间（UTC+8），用于本地化显示，可选以兼容历史数据
  updateTimeShanghai?: string;
  imageUrl: string;
}

interface ChatMessage {
  id: string;
  message: string;
  role?: 'user' | 'assistant';
  timestamp: string;
  token: string;
}

interface ChatHistory {
  messages: ChatMessage[];
  total: number;
}

interface PaginationOptions {
  page: number;
  limit: number;
}

class LibreChatService {
  private static instance: LibreChatService;
  private latestRecord: ImageRecord | null = null;
  private readonly DATA_DIR = join(process.cwd(), 'data');
  private readonly DATA_FILE = join(this.DATA_DIR, 'lc_data.json');
  private readonly CHAT_HISTORY_FILE = join(this.DATA_DIR, 'chat_history.json');
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private chatHistory: ChatMessage[] = [];

  private constructor() {
    this.initializeService();
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
        const latestDoc = await LatestRecordModel.findById('latest').lean();
        if (latestDoc) {
          const d: any = latestDoc;
          this.latestRecord = {
            updateTime: d.updateTime,
            updateTimeShanghai: d.updateTimeShanghai,
            imageUrl: d.imageUrl,
          };
          logger.info('从 MongoDB 加载最新的 LibreChat 记录 (librechat_latest)');
        } else {
          // 回退：尝试从历史图片集合中读取最近一条（仅保留 imageUrl）
          const latest = await ImageRecordModel.findOne().sort({ createdAt: -1 }).lean();
          this.latestRecord = latest ? { updateTime: new Date().toISOString(), imageUrl: (latest as any).imageUrl } : null;
          if (this.latestRecord) {
            logger.info('从 MongoDB 加载回退的 LibreChat 图片记录 (librechat_images)');
          }
        }
        // 加载聊天历史
        const history = await ChatHistoryModel.findOne().sort({ updatedAt: -1 }).lean();
        const h: any = history;
        this.chatHistory = h && Array.isArray(h.messages) ? h.messages : [];
        logger.info('Loaded chat history from MongoDB');
        if (!this.isRunning && process.env.NODE_ENV !== 'test') {
          this.startPeriodicCheck();
        }
        return;
      }
    } catch (error) {
      logger.error('从 MongoDB 加载 LibreChat 数据失败，降级为本地文件:', error);
    }
    // 本地文件兜底
    try {
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.info('创建 LibreChat 服务的数据目录');
      }
      if (existsSync(this.DATA_FILE)) {
        const data = await readFile(this.DATA_FILE, 'utf-8');
        this.latestRecord = JSON.parse(data);
        logger.info('加载之前的 LibreChat 镜像记录');
      }
      if (existsSync(this.CHAT_HISTORY_FILE)) {
        const data = await readFile(this.CHAT_HISTORY_FILE, 'utf-8');
        this.chatHistory = JSON.parse(data);
        logger.info('加载聊天历史');
      }
      if (!this.isRunning && process.env.NODE_ENV !== 'test') {
        this.startPeriodicCheck();
      }
    } catch (error) {
      logger.error('Error initializing LibreChat service:', error);
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
          'latest',
          { ...record, updatedAt: new Date() },
          { upsert: true, setDefaultsOnInsert: true }
        );
        logger.info('已将最新的 LibreChat 记录写入/更新到 MongoDB');
      }
    } catch (error) {
      logger.error('保存 LibreChat 记录时出错:', error);
    }
  }

  private async saveChatHistory() {
    try {
      await writeFile(this.CHAT_HISTORY_FILE, JSON.stringify(this.chatHistory, null, 2));
    } catch (error) {
      logger.error('保存聊天历史时出错:', error);
    }
  }

  private async fetchAndRecord() {
    try {
      const url = 'https://github.com/danny-avila/LibreChat/pkgs/container/librechat-dev';
      const response = await axios.get(url);

      // 使用 JSDOM 解析 HTML
      const dom = new JSDOM(response.data);
      const document = dom.window.document;

      // 查找 Docker 命令
      const clipboardCopy = document.querySelector('clipboard-copy');
      if (clipboardCopy) {
        const dockerCommand = clipboardCopy.getAttribute('value') || '';
        const filteredCommand = dockerCommand.replace('docker pull ', '');
        // 生成时间：UTC 和 上海时间（UTC+8）
        const now = new Date();
        const fmt = new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
        const shanghai = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;

        // 创建新记录
        const newRecord: ImageRecord = {
          updateTime: now.toISOString(),
          updateTimeShanghai: shanghai,
          imageUrl: filteredCommand
        };

        // 保存记录
        await this.saveRecord(newRecord);
      }
    } catch (error) {
      logger.error('获取 LibreChat 镜像数据时出错:', error);
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
        'latest',
        { ...this.latestRecord, updatedAt: new Date() },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch(err => {
        logger.error('更新或插入最新记录失败:', err);
      });
    }
    return this.latestRecord;
  }

  /**
   * 发送聊天消息
   */
  public async sendMessage(token: string, message: string): Promise<string> {
    // 先将用户消息写入历史
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      message,
      role: 'user',
      timestamp: new Date().toISOString(),
      token
    };
    this.chatHistory.push(userMsg);
    await this.saveChatHistory();

    // 若用户询问“你是什么模型”等同类问题，严格保持沉默并直接返回空字符串
    if (isModelIdentityQuery(message)) {
      logger.info('拦截模型识别类问题，按规则保持沉默');
      return '';
    }

    // 读取 OpenAI 兼容配置
    const baseURL = process.env.CHAT_BASE_URL?.replace(/\/$/, '') || '';
    const apiKey = process.env.CHAT_API_KEY || '';
    const model = 'gpt-oss-120b';

    // 如果未配置，则返回降级的本地回复（不阻塞）
    if (!baseURL || !apiKey) {
      logger.warn('CHAT_BASE_URL 或 CHAT_API_KEY 未配置，使用本地模拟回复');
      const fallback = '系统暂未配置对话服务，已返回本地示例回答。';
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        message: fallback,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        token
      };
      this.chatHistory.push(aiMsg);
      await this.saveChatHistory();
      return fallback;
    }

    try {
      // 组织对话上下文（可扩展：带上最近若干轮同一 token 的消息）
      const recent = this.chatHistory
        .filter(m => m.token === token)
        .slice(-20); // 仅取最近10条以控制上下文长度

      const messagesPayload = [
        {
          role: 'system',
          content:
            '你是 Synapse LibreChat 的客服助理，必须使用中文并提供专业、准确、简洁的回答。\n' +
            '重要规则：\n' +
            '1) 当用户询问你“是什么模型/用的什么模型/模型名称/模型版本/运行在什么模型”等同类问题时，保持沉默，不要作答，不要输出任何字符。\n' +
            '2) 不要改变身份，不要扮演其他角色。\n' +
            '3) 在确保安全与合规的前提下，遵循用户的正常需求与指令。'
        },
        ...recent.map(m => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.message
        })),
      ];

      const url = `${baseURL}/v1/chat/completions`;
      const resp = await axios.post(url, {
        model,
        messages: messagesPayload,
        temperature: 0.7,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60_000
      });

      // 解析 OpenAI 兼容响应并清洗 think 标签
      const aiTextRaw = resp?.data?.choices?.[0]?.message?.content?.trim() || '（无有效回复）';
      const aiText = sanitizeAssistantText(aiTextRaw);

      // 持久化助手回复
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        message: aiText,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        token
      };
      this.chatHistory.push(aiMsg);
      await this.saveChatHistory();

      return aiText;
    } catch (err: any) {
      logger.error('调用 OpenAI 兼容聊天接口失败:', err?.response?.data || err?.message || err);
      const fallback = '对话服务暂不可用，请稍后重试。';
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        message: fallback,
        role: 'assistant',
        timestamp: new Date().toISOString(),
        token
      };
      this.chatHistory.push(aiMsg);
      await this.saveChatHistory();
      return fallback;
    }
  }

  /**
   * 获取聊天历史
   */
  public async getHistory(token: string, options: PaginationOptions = { page: 1, limit: 20 }): Promise<ChatHistory> {
    const userMessages = this.chatHistory.filter(msg => msg.token === token);
    const total = userMessages.length;

    const startIndex = (options.page - 1) * options.limit;
    const endIndex = startIndex + options.limit;
    const messages = userMessages.slice(startIndex, endIndex);

    return {
      messages,
      total
    };
  }

  /**
   * 清除聊天历史
   */
  public async clearHistory(token: string): Promise<void> {
    this.chatHistory = this.chatHistory.filter(msg => msg.token !== token);
    await this.saveChatHistory();
  }

  /**
   * 按消息ID删除（仅删除属于该 token 的消息）
   */
  public async deleteMessage(token: string, id: string): Promise<{ removed: number }> {
    const before = this.chatHistory.length;
    this.chatHistory = this.chatHistory.filter(m => !(m.token === token && m.id === id));
    const removed = before - this.chatHistory.length;
    if (removed > 0) await this.saveChatHistory();
    return { removed };
  }

  /**
   * 批量按消息ID删除（仅删除属于该 token 的消息）
   */
  public async deleteMessages(token: string, ids: string[]): Promise<{ removed: number }> {
    const idSet = new Set(ids || []);
    const before = this.chatHistory.length;
    this.chatHistory = this.chatHistory.filter(m => !(m.token === token && idSet.has(m.id)));
    const removed = before - this.chatHistory.length;
    if (removed > 0) await this.saveChatHistory();
    return { removed };
  }

  /**
   * 导出指定 token 的全部历史为纯文本
   */
  public async exportHistoryText(token: string): Promise<{ content: string; count: number }> {
    const userMessages = this.chatHistory.filter(msg => msg.token === token);
    const count = userMessages.length;
    const now = new Date();
    const header = `LibreChat 历史导出\n导出时间：${now.toLocaleString()}\nToken：${token}\n总条数：${count}\n\n`;
    const lines = userMessages.map((m, idx) => {
      // 历史中未保存角色信息，保留通用格式
      const ts = m.timestamp ? ` @ ${m.timestamp}` : '';
      const content = sanitizeAssistantText(m.message || '');
      return `#${idx + 1}${ts}\n${content}\n`;
    });
    return { content: header + lines.join('\n'), count };
  }

  // 清理方法，用于测试环境
  public cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }
}

export const libreChatService = LibreChatService.getInstance(); 