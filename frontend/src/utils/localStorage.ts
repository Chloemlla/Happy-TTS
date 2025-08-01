import { openDB, deleteDB, IDBPDatabase } from 'idb';
import CryptoJS from 'crypto-js';

// 存储配置接口
export interface StorageConfig {
  dbName: string;
  storeName: string;
  version: number;
  encryptionKey?: string;
}

// 数据项接口
export interface StorageItem<T = any> {
  id: string;
  data: T;
  type: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// 导出格式
export type ExportFormat = 'plain' | 'base64' | 'aes256';

// 导出数据接口
export interface ExportData {
  mode: ExportFormat;
  data: any;
  iv?: string;
  timestamp: string;
  version: string;
}

// 通用本地存储类
export class LocalStorageManager<T = any> {
  private db: IDBPDatabase | null = null;
  private config: StorageConfig;
  private encryptionKey: string;

  constructor(config: StorageConfig) {
    this.config = config;
    this.encryptionKey = config.encryptionKey || 'default-encryption-key';
  }

  // 初始化数据库
  private async initDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db;

    this.db = await openDB(this.config.dbName, this.config.version, {
      upgrade: (db, oldVersion, newVersion) => {
        console.log(`[${this.config.dbName}] 数据库升级: v${oldVersion} -> v${newVersion}`);
        
        if (oldVersion < 1) {
          // 初始版本：创建存储对象
          if (!db.objectStoreNames.contains(this.config.storeName)) {
            db.createObjectStore(this.config.storeName, { keyPath: 'id' });
          }
        }
      },
    });

    return this.db;
  }

  // 生成唯一ID
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 格式化日期
  private formatDate(date: Date = new Date()): string {
    return date.toISOString();
  }

  // AES-256加密
  private encryptAES256(data: string): { iv: string, data: string } {
    const iv = CryptoJS.lib.WordArray.random(16);
    const keyBytes = CryptoJS.SHA256(this.encryptionKey);
    const encrypted = CryptoJS.AES.encrypt(data, keyBytes, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return {
      iv: iv.toString(CryptoJS.enc.Hex),
      data: encrypted.ciphertext.toString(CryptoJS.enc.Hex),
    };
  }

  // AES-256解密
  private decryptAES256(encryptedData: string, iv: string): string {
    const keyBytes = CryptoJS.SHA256(this.encryptionKey);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: encryptedBytes }, keyBytes, {
      iv: ivBytes,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  // 保存数据
  async save(id: string, data: T, type: string, metadata?: Record<string, any>): Promise<void> {
    try {
      const db = await this.initDB();
      const item: StorageItem<T> = {
        id,
        data,
        type,
        createdAt: this.formatDate(),
        updatedAt: this.formatDate(),
        metadata
      };
      
      await db.put(this.config.storeName, item);
      console.log(`[${this.config.dbName}] 保存成功，ID: ${id}`);
    } catch (error) {
      console.error(`[${this.config.dbName}] 保存失败:`, error);
      throw error;
    }
  }

  // 获取单个数据
  async get(id: string): Promise<StorageItem<T> | null> {
    try {
      const db = await this.initDB();
      const item = await db.get(this.config.storeName, id);
      return item || null;
    } catch (error) {
      console.error(`[${this.config.dbName}] 获取失败:`, error);
      return null;
    }
  }

  // 获取所有数据
  async getAll(): Promise<StorageItem<T>[]> {
    try {
      const db = await this.initDB();
      const items = await db.getAll(this.config.storeName);
      return items || [];
    } catch (error) {
      console.error(`[${this.config.dbName}] 获取所有数据失败:`, error);
      return [];
    }
  }

  // 根据类型获取数据
  async getByType(type: string): Promise<StorageItem<T>[]> {
    try {
      const allItems = await this.getAll();
      return allItems.filter(item => item.type === type);
    } catch (error) {
      console.error(`[${this.config.dbName}] 根据类型获取数据失败:`, error);
      return [];
    }
  }

  // 删除数据
  async delete(id: string): Promise<void> {
    try {
      const db = await this.initDB();
      await db.delete(this.config.storeName, id);
      console.log(`[${this.config.dbName}] 删除成功，ID: ${id}`);
    } catch (error) {
      console.error(`[${this.config.dbName}] 删除失败:`, error);
      throw error;
    }
  }

  // 清空所有数据
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      await db.clear(this.config.storeName);
      console.log(`[${this.config.dbName}] 清空成功`);
    } catch (error) {
      console.error(`[${this.config.dbName}] 清空失败:`, error);
      throw error;
    }
  }

  // 检查并修复数据库
  async checkAndFix(): Promise<void> {
    try {
      const db = await this.initDB();
      await db.getAll(this.config.storeName);
      console.log(`[${this.config.dbName}] 数据库检查通过`);
    } catch (error) {
      console.error(`[${this.config.dbName}] 数据库检查失败，尝试重置:`, error);
      await this.reset();
    }
  }

  // 重置数据库
  async reset(): Promise<void> {
    try {
      const db = await this.initDB();
      await db.clear(this.config.storeName);
      console.log(`[${this.config.dbName}] 数据库重置成功`);
    } catch (error) {
      console.error(`[${this.config.dbName}] 数据库重置失败:`, error);
      // 如果重置失败，尝试删除并重新创建数据库
      try {
        await deleteDB(this.config.dbName);
        this.db = null;
        console.log(`[${this.config.dbName}] 数据库删除成功，将在下次访问时重新创建`);
      } catch (deleteError) {
        console.error(`[${this.config.dbName}] 数据库删除失败:`, deleteError);
      }
    }
  }

  // 导出数据
  async export(format: ExportFormat = 'plain'): Promise<void> {
    try {
      const data = await this.getAll();
      if (data.length === 0) {
        throw new Error('没有数据可以导出');
      }

      let exportObj: ExportData;
      if (format === 'plain') {
        exportObj = {
          mode: 'plain',
          data: data,
          timestamp: this.formatDate(),
          version: '1.0'
        };
      } else if (format === 'base64') {
        exportObj = {
          mode: 'base64',
          data: btoa(unescape(encodeURIComponent(JSON.stringify(data)))),
          timestamp: this.formatDate(),
          version: '1.0'
        };
      } else if (format === 'aes256') {
        const raw = JSON.stringify(data);
        const encrypted = this.encryptAES256(raw);
        exportObj = {
          mode: 'aes256',
          data: encrypted.data,
          iv: encrypted.iv,
          timestamp: this.formatDate(),
          version: '1.0'
        };
      } else {
        throw new Error('不支持的导出格式');
      }

      const dataStr = JSON.stringify(exportObj, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.config.dbName}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`[${this.config.dbName}] 导出失败:`, error);
      throw error;
    }
  }

  // 导入数据
  async import(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const importedObj: ExportData = JSON.parse(ev.target?.result as string);
          let importedData: StorageItem<T>[] = [];

          if (Array.isArray(importedObj)) {
            // 兼容老格式
            importedData = importedObj;
          } else if (importedObj.mode === 'plain') {
            importedData = importedObj.data;
          } else if (importedObj.mode === 'base64') {
            importedData = JSON.parse(decodeURIComponent(escape(atob(importedObj.data))));
          } else if (importedObj.mode === 'aes256') {
            const decrypted = this.decryptAES256(importedObj.data, importedObj.iv!);
            importedData = JSON.parse(decrypted);
          } else {
            throw new Error('未知的数据格式');
          }

          const validData = importedData.filter((item: any) => item.id && item.data && item.type);
          if (validData.length === 0) {
            throw new Error('没有找到有效的数据');
          }

          // 获取现有数据
          const existingData = await this.getAll();
          const existingIds = new Set(existingData.map((item: any) => item.id));
          const newData = validData.filter((item: any) => !existingIds.has(item.id));
          const mergedData = [...existingData, ...newData];

          // 保存到数据库
          const db = await this.initDB();
          await db.clear(this.config.storeName);
          for (const item of mergedData) {
            await db.put(this.config.storeName, item);
          }

          console.log(`[${this.config.dbName}] 导入成功，记录数量: ${mergedData.length}`);
          resolve(newData.length);
        } catch (error: any) {
          reject(new Error(`导入失败: ${error.message}`));
        }
      };
      reader.readAsText(file);
    });
  }

  // 获取数据统计
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    oldestItem?: string;
    newestItem?: string;
  }> {
    try {
      const data = await this.getAll();
      const byType: Record<string, number> = {};
      
      data.forEach(item => {
        byType[item.type] = (byType[item.type] || 0) + 1;
      });

      const dates = data.map(item => new Date(item.createdAt)).sort();
      
      return {
        total: data.length,
        byType,
        oldestItem: dates.length > 0 ? dates[0].toISOString() : undefined,
        newestItem: dates.length > 0 ? dates[dates.length - 1].toISOString() : undefined
      };
    } catch (error) {
      console.error(`[${this.config.dbName}] 获取统计信息失败:`, error);
      return { total: 0, byType: {} };
    }
  }

  // 搜索数据
  async search(query: string, fields: (keyof T)[] = []): Promise<StorageItem<T>[]> {
    try {
      const data = await this.getAll();
      const results: StorageItem<T>[] = [];

      for (const item of data) {
        let match = false;
        
        // 搜索 ID
        if (item.id.toLowerCase().includes(query.toLowerCase())) {
          match = true;
        }
        
        // 搜索类型
        if (item.type.toLowerCase().includes(query.toLowerCase())) {
          match = true;
        }
        
        // 搜索指定字段
        if (fields.length > 0) {
          for (const field of fields) {
            const fieldValue = item.data[field];
            if (fieldValue && String(fieldValue).toLowerCase().includes(query.toLowerCase())) {
              match = true;
              break;
            }
          }
        }
        
        if (match) {
          results.push(item);
        }
      }

      return results;
    } catch (error) {
      console.error(`[${this.config.dbName}] 搜索失败:`, error);
      return [];
    }
  }

  // 批量操作
  async batch(operations: Array<{
    type: 'save' | 'delete';
    id: string;
    data?: T;
    itemType?: string;
    metadata?: Record<string, any>;
  }>): Promise<void> {
    try {
      const db = await this.initDB();
      
      for (const operation of operations) {
        if (operation.type === 'save' && operation.data && operation.itemType) {
          const item: StorageItem<T> = {
            id: operation.id,
            data: operation.data,
            type: operation.itemType,
            createdAt: this.formatDate(),
            updatedAt: this.formatDate(),
            metadata: operation.metadata
          };
          await db.put(this.config.storeName, item);
        } else if (operation.type === 'delete') {
          await db.delete(this.config.storeName, operation.id);
        }
      }
      
      console.log(`[${this.config.dbName}] 批量操作完成，操作数量: ${operations.length}`);
    } catch (error) {
      console.error(`[${this.config.dbName}] 批量操作失败:`, error);
      throw error;
    }
  }
}

// 预定义的存储配置
export const STORAGE_CONFIGS = {
  // LogShare 配置
  LOGSHARE: {
    dbName: 'logshare-store',
    storeName: 'logshare',
    version: 1,
    encryptionKey: 'happy_logshare'
  },
  
  // 图片上传配置
  IMAGE_UPLOAD: {
    dbName: 'image-store',
    storeName: 'images',
    version: 2,
    encryptionKey: 'happy_images'
  },
  
  // 用户配置
  USER_SETTINGS: {
    dbName: 'user-settings',
    storeName: 'settings',
    version: 1,
    encryptionKey: 'user_settings'
  },
  
  // 缓存配置
  CACHE: {
    dbName: 'app-cache',
    storeName: 'cache',
    version: 1,
    encryptionKey: 'app_cache'
  }
} as const;

// 创建存储实例的工厂函数
export function createStorageManager<T = any>(config: StorageConfig): LocalStorageManager<T> {
  return new LocalStorageManager<T>(config);
}

// 便捷的存储实例
export const logShareStorage = createStorageManager(STORAGE_CONFIGS.LOGSHARE);
export const imageUploadStorage = createStorageManager(STORAGE_CONFIGS.IMAGE_UPLOAD);
export const userSettingsStorage = createStorageManager(STORAGE_CONFIGS.USER_SETTINGS);
export const cacheStorage = createStorageManager(STORAGE_CONFIGS.CACHE);

// 工具函数：格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 工具函数：格式化日期
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// 工具函数：生成唯一ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
} 