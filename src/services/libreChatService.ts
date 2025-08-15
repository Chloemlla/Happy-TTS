import axios from 'axios';
import { JSDOM } from 'jsdom';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger';
import { mongoose } from '../services/mongoService';

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
          logger.info('Loaded latest LibreChat record from MongoDB (librechat_latest)');
        } else {
          // 回退：尝试从历史图片集合中读取最近一条（仅保留 imageUrl）
          const latest = await ImageRecordModel.findOne().sort({ createdAt: -1 }).lean();
          this.latestRecord = latest ? { updateTime: new Date().toISOString(), imageUrl: (latest as any).imageUrl } : null;
          if (this.latestRecord) {
            logger.info('Loaded fallback LibreChat image record from MongoDB (librechat_images)');
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
      logger.error('MongoDB 加载 LibreChat 数据失败，降级为本地文件:', error);
    }
    // 本地文件兜底
    try {
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.info('Created data directory for LibreChat service');
      }
      if (existsSync(this.DATA_FILE)) {
        const data = await readFile(this.DATA_FILE, 'utf-8');
        this.latestRecord = JSON.parse(data);
        logger.info('Loaded previous LibreChat image record');
      }
      if (existsSync(this.CHAT_HISTORY_FILE)) {
        const data = await readFile(this.CHAT_HISTORY_FILE, 'utf-8');
        this.chatHistory = JSON.parse(data);
        logger.info('Loaded chat history');
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
      logger.info(`Saved new LibreChat image record: ${record.imageUrl}`);
      // 同步保存到 MongoDB（单例 upsert）
      if (mongoose.connection.readyState === 1) {
        await LatestRecordModel.findByIdAndUpdate(
          'latest',
          { ...record, updatedAt: new Date() },
          { upsert: true, setDefaultsOnInsert: true }
        );
        logger.info('Upserted latest LibreChat record to MongoDB');
      }
    } catch (error) {
      logger.error('Error saving LibreChat record:', error);
    }
  }

  private async saveChatHistory() {
    try {
      await writeFile(this.CHAT_HISTORY_FILE, JSON.stringify(this.chatHistory, null, 2));
    } catch (error) {
      logger.error('Error saving chat history:', error);
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
      logger.error('Error fetching LibreChat image data:', error);
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
        logger.log('Failed to upsert latest record on getLatestRecord:', err);
      });
    }
    return this.latestRecord;
  }

  /**
   * 发送聊天消息
   */
  public async sendMessage(token: string, message: string): Promise<string> {
    // 模拟发送消息到LibreChat
    const chatMessage: ChatMessage = {
      id: Date.now().toString(),
      message,
      timestamp: new Date().toISOString(),
      token
    };

    // 添加到历史记录
    this.chatHistory.push(chatMessage);
    await this.saveChatHistory();

    // 模拟AI响应
    const responses = [
      '我理解您的问题，让我为您解答...',
      '这是一个很好的问题，根据我的了解...',
      '感谢您的提问，我的回答是...',
      '基于您提供的信息，我认为...',
      '让我为您详细解释一下...'
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    // 保存AI响应
    const aiMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      message: randomResponse,
      timestamp: new Date().toISOString(),
      token
    };

    this.chatHistory.push(aiMessage);
    await this.saveChatHistory();

    return randomResponse;
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