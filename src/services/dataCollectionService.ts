import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger';

class DataCollectionService {
  private static instance: DataCollectionService;
  private readonly DATA_DIR = join(process.cwd(), 'data');
  private readonly TEST_DATA_DIR = join(process.cwd(), 'test-data');
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
      // 验证数据
      if (!data || typeof data !== 'object') {
        throw new Error('无效的数据格式');
      }

      // 检查必需字段
      if (!data.userId || !data.action || !data.timestamp) {
        throw new Error('缺少必需字段');
      }

      // 确定保存目录（测试环境使用test-data目录）
      const saveDir = process.env.NODE_ENV === 'test' ? this.TEST_DATA_DIR : this.DATA_DIR;
      const saveFile = join(saveDir, `data-${Date.now()}.json`);

      // 确保目录存在
      if (!existsSync(saveDir)) {
        await mkdir(saveDir, { recursive: true });
      }

      // 保存数据为JSON文件
      await writeFile(saveFile, JSON.stringify(data, null, 2));
      logger.log('Data saved successfully');
    } catch (error) {
      logger.error('Error saving data:', error);
      throw error;
    }
  }
}

export const dataCollectionService = DataCollectionService.getInstance(); 