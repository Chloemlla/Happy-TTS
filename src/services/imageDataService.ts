import { mongoose } from './mongoService';
import crypto from 'crypto';

interface ImageDataRecord {
  imageId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  md5Hash: string;
  web2url: string;
  cid: string;
  uploadTime: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ValidationResult {
  isValid: boolean;
  message: string;
  imageData?: ImageDataRecord;
}

// 定义 Mongoose Schema
const ImageDataSchema = new mongoose.Schema({
  imageId: { type: String, required: true, unique: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  fileHash: { type: String, required: true },
  md5Hash: { type: String, required: true },
  web2url: { type: String, required: true },
  cid: { type: String, required: true },
  uploadTime: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'image_data' });

const ImageDataModel = mongoose.models.ImageData || mongoose.model('ImageData', ImageDataSchema);

function isValidImageId(imageId: string) {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(imageId);
}

class ImageDataService {
  constructor() {
    // 使用已存在的mongoose连接，不需要初始化数据库
    console.log('✅ 图片数据服务初始化完成，使用共享的MongoDB连接');
  }

  // 记录图片数据到数据库
  async recordImageData(data: Omit<ImageDataRecord, 'createdAt' | 'updatedAt'>): Promise<ImageDataRecord> {
    try {
      if (!isValidImageId(data.imageId)) throw new Error('非法 imageId');
      const record: ImageDataRecord = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 检查是否已存在相同的imageId
      if (!isValidImageId(data.imageId)) throw new Error('非法 imageId');
      const existing = await ImageDataModel.findOne({ imageId: data.imageId });
      if (existing) {
        // 更新现有记录
        const result = await ImageDataModel.updateOne(
          { imageId: data.imageId },
          { 
            $set: { 
              ...data, 
              updatedAt: new Date() 
            } 
          }
        );
        return { ...record, ...data };
      } else {
        // 插入新记录
        const newRecord = new ImageDataModel(record);
        await newRecord.save();
        return record;
      }
    } catch (error) {
      console.error('❌ 图片数据记录失败:', error);
      throw error;
    }
  }

  // 验证单个图片数据
  async validateImageData(imageId: string, fileHash: string, md5Hash: string): Promise<ValidationResult> {
    try {
      if (!isValidImageId(imageId)) throw new Error('非法 imageId');
      const imageData = await ImageDataModel.findOne({ imageId });
      
      if (!imageData) {
        return {
          isValid: false,
          message: '图片数据不存在'
        };
      }

      if (imageData.fileHash !== fileHash) {
        return {
          isValid: false,
          message: '文件Hash不匹配',
          imageData: imageData.toObject()
        };
      }

      if (imageData.md5Hash !== md5Hash) {
        return {
          isValid: false,
          message: 'MD5 Hash不匹配',
          imageData: imageData.toObject()
        };
      }

      return {
        isValid: true,
        message: '验证通过',
        imageData: imageData.toObject()
      };
    } catch (error) {
      console.error('❌ 图片数据验证失败:', error);
      throw error;
    }
  }

  // 批量验证图片数据
  async validateBatchImageData(imageDataList: Array<{imageId: string, fileHash: string, md5Hash: string}>): Promise<ValidationResult[]> {
    try {
      const results: ValidationResult[] = [];
      
      for (const data of imageDataList) {
        const result = await this.validateImageData(data.imageId, data.fileHash, data.md5Hash);
        results.push(result);
      }
      
      return results;
    } catch (error) {
      console.error('❌ 批量图片数据验证失败:', error);
      throw error;
    }
  }

  // 获取图片数据信息
  async getImageDataInfo(imageId: string): Promise<ImageDataRecord | null> {
    try {
      if (!isValidImageId(imageId)) throw new Error('非法 imageId');
      const imageData = await ImageDataModel.findOne({ imageId });
      return imageData ? imageData.toObject() : null;
    } catch (error) {
      console.error('❌ 获取图片数据信息失败:', error);
      throw error;
    }
  }

  // 生成图片ID
  static generateImageId(): string {
    // 优先使用 crypto.randomUUID，如果不支持则使用兼容方法
    if (crypto.randomUUID) {
      try {
        return crypto.randomUUID();
      } catch (error) {
        console.warn('[UUID生成] crypto.randomUUID 失败，使用兼容方法:', error);
      }
    }
    
    // 兼容性UUID生成方法
    const pattern = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return pattern.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // 生成文件Hash
  static generateFileHash(fileContent: Buffer): string {
    return crypto.createHash('sha256').update(fileContent).digest('hex');
  }

  // 生成MD5 Hash
  static generateMD5Hash(fileContent: Buffer): string {
    return crypto.createHash('md5').update(fileContent).digest('hex');
  }
}

export const imageDataService = new ImageDataService(); 