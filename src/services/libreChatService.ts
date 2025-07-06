import axios from 'axios';
import { JSDOM } from 'jsdom';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger';

interface ImageRecord {
  updateTime: string;
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
      // 确保数据目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.log('Created data directory for LibreChat service');
      }

      // 加载之前的记录
      if (existsSync(this.DATA_FILE)) {
        const data = await readFile(this.DATA_FILE, 'utf-8');
        this.latestRecord = JSON.parse(data);
        logger.log('Loaded previous LibreChat image record');
      }

      // 加载聊天历史
      if (existsSync(this.CHAT_HISTORY_FILE)) {
        const data = await readFile(this.CHAT_HISTORY_FILE, 'utf-8');
        this.chatHistory = JSON.parse(data);
        logger.log('Loaded chat history');
      }

      // 只在非测试环境中启动定时检查
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
      logger.log(`Saved new LibreChat image record: ${record.imageUrl}`);
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
        
        // 创建新记录
        const newRecord: ImageRecord = {
          updateTime: new Date().toISOString(),
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