import { api } from './index';

export interface ImageDataRecord {
  imageId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  md5Hash: string;
  web2url: string;
  cid: string;
  uploadTime: string;
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
  imageData?: ImageDataRecord;
}

export const imageDataApi = {
  // 验证单个图片数据
  async validateImageData(imageId: string, fileHash: string, md5Hash: string): Promise<ValidationResult> {
    const response = await api.post('/api/image-data/validate', {
      imageId,
      fileHash,
      md5Hash
    });
    return response.data.data;
  },

  // 批量验证图片数据
  async validateBatchImageData(imageDataList: Array<{imageId: string, fileHash: string, md5Hash: string}>): Promise<ValidationResult[]> {
    const response = await api.post('/api/image-data/validate-batch', {
      imageDataList
    });
    return response.data.data;
  },

  // 获取图片数据信息
  async getImageDataInfo(imageId: string): Promise<ImageDataRecord | null> {
    const response = await api.get(`/api/image-data/info/${imageId}`);
    return response.data.data;
  },

  // 记录图片数据到数据库
  async recordImageData(data: Omit<ImageDataRecord, 'createdAt' | 'updatedAt'>): Promise<ImageDataRecord> {
    const response = await api.post('/api/image-data/record', data);
    return response.data.data;
  }
}; 