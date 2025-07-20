import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger';
import { mongoose } from './mongoService';

// MongoDB 数据收集 Schema
const DataCollectionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  action: { type: String, required: true },
  timestamp: { type: String, required: true },
  details: { type: Object },
}, { collection: 'data_collections' });
const DataCollectionModel = mongoose.models.DataCollection || mongoose.model('DataCollection', DataCollectionSchema);

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
      if (!data.userId || !data.action || !data.timestamp) {
        throw new Error('缺少必需字段');
      }
      // MongoDB 优先
      if (mongoose.connection.readyState === 1) {
        await DataCollectionModel.create(data);
        logger.log('Data saved to MongoDB');
        return;
      }
    } catch (error) {
      logger.error('MongoDB 保存数据失败，降级为本地文件:', error);
    }
    // 本地文件兜底
    try {
      const saveDir = process.env.NODE_ENV === 'test' ? this.TEST_DATA_DIR : this.DATA_DIR;
      const saveFile = join(saveDir, `data-${Date.now()}.json`);
      if (!existsSync(saveDir)) {
        await mkdir(saveDir, { recursive: true });
      }
      await writeFile(saveFile, JSON.stringify(data, null, 2));
      logger.log('Data saved to local file');
    } catch (error) {
      logger.error('Error saving data to local file:', error);
      throw error;
    }
  }
}

export const dataCollectionService = DataCollectionService.getInstance(); 