import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger';

class DataCollectionService {
  private static instance: DataCollectionService;
  private readonly DATA_DIR = join(process.cwd(), 'data');
  private readonly DATA_FILE = join(this.DATA_DIR, 'collection-data.txt');

  private constructor() {
    this.initializeService();
  }

  public static getInstance(): DataCollectionService {
    if (!DataCollectionService.instance) {
      DataCollectionService.instance = new DataCollectionService();
    }
    return DataCollectionService.instance;
  }

  private async initializeService() {
    try {
      // 确保数据目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.log('Created data directory for data collection');
      }
    } catch (error) {
      logger.error('Error initializing data collection service:', error);
    }
  }

  public async saveData(data: any): Promise<void> {
    try {
      // 将数据转换为 JSON 字符串并添加换行符
      const jsonString = JSON.stringify(data) + '\n';
      
      // 以追加模式写入文件
      await appendFile(this.DATA_FILE, jsonString);
      logger.log('Data saved successfully');
    } catch (error) {
      logger.error('Error saving data:', error);
      throw error;
    }
  }
}

export const dataCollectionService = DataCollectionService.getInstance(); 