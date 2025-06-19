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

class LibreChatService {
  private static instance: LibreChatService;
  private latestRecord: ImageRecord | null = null;
  private readonly DATA_DIR = join(process.cwd(), 'data');
  private readonly DATA_FILE = join(this.DATA_DIR, 'lc_data.json');
  private isRunning: boolean = false;

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

      // 开始定时检查
      if (!this.isRunning) {
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
    setInterval(() => {
      this.fetchAndRecord();
    }, 3600000); // 3600000 ms = 1 hour
  }

  public getLatestRecord(): ImageRecord | null {
    return this.latestRecord;
  }
}

export const libreChatService = LibreChatService.getInstance(); 