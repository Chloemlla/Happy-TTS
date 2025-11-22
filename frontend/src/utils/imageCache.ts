/**
 * 图片缓存服务
 * 使用IndexedDB缓存图片，提升加载性能
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * 图片缓存数据库Schema
 */
interface ImageCacheDB extends DBSchema {
  images: {
    key: string;
    value: {
      id: string;
      hash: string;
      blob: Blob;
      timestamp: number;
      size: number;
    };
  };
}

const DB_NAME = 'ImageCache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7天
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB总缓存大小

/**
 * 图片缓存服务类
 */
class ImageCacheService {
  private db: IDBPDatabase<ImageCacheDB> | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化数据库连接
   */
  private async initDB(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.db = await openDB<ImageCacheDB>(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
          },
        });
      } catch (error) {
        console.error('初始化图片缓存数据库失败:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 获取数据库实例
   */
  private async getDB(): Promise<IDBPDatabase<ImageCacheDB>> {
    if (!this.db) {
      await this.initDB();
    }
    if (!this.db) {
      throw new Error('数据库未初始化');
    }
    return this.db;
  }

  /**
   * 获取缓存的图片
   * @param imageId 图片ID
   * @param imageHash 图片哈希值（用于验证）
   * @returns Blob URL或null
   */
  async get(imageId: string, imageHash: string): Promise<string | null> {
    try {
      const db = await this.getDB();
      const cached = await db.get(STORE_NAME, imageId);

      if (!cached) {
        return null;
      }

      // 检查哈希值
      if (cached.hash !== imageHash) {
        await this.delete(imageId); // 哈希不匹配，删除旧缓存
        return null;
      }

      // 检查缓存时间
      const age = Date.now() - cached.timestamp;
      if (age > MAX_CACHE_AGE) {
        await this.delete(imageId); // 缓存过期，删除
        return null;
      }

      // 返回Blob URL
      return URL.createObjectURL(cached.blob);
    } catch (error) {
      console.warn('获取缓存图片失败:', error);
      return null;
    }
  }

  /**
   * 缓存图片
   * @param imageId 图片ID
   * @param imageHash 图片哈希值
   * @param blob 图片Blob数据
   */
  async set(imageId: string, imageHash: string, blob: Blob): Promise<void> {
    try {
      // 检查缓存大小
      await this.checkCacheSize(blob.size);

      const db = await this.getDB();
      await db.put(STORE_NAME, {
        id: imageId,
        hash: imageHash,
        blob,
        timestamp: Date.now(),
        size: blob.size,
      });
    } catch (error) {
      console.warn('缓存图片失败:', error);
    }
  }

  /**
   * 删除缓存的图片
   * @param imageId 图片ID
   */
  async delete(imageId: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.delete(STORE_NAME, imageId);
    } catch (error) {
      console.warn('删除缓存图片失败:', error);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.clear(STORE_NAME);
    } catch (error) {
      console.warn('清空图片缓存失败:', error);
    }
  }

  /**
   * 清理过期缓存
   * @returns 删除的缓存数量
   */
  async cleanExpired(): Promise<number> {
    try {
      const db = await this.getDB();
      const allImages = await db.getAll(STORE_NAME);
      const now = Date.now();
      let deletedCount = 0;

      for (const image of allImages) {
        if (now - image.timestamp > MAX_CACHE_AGE) {
          await db.delete(STORE_NAME, image.id);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.warn('清理过期缓存失败:', error);
      return 0;
    }
  }

  /**
   * 检查并控制缓存大小
   * @param newImageSize 新图片的大小
   */
  private async checkCacheSize(newImageSize: number): Promise<void> {
    try {
      const db = await this.getDB();
      const allImages = await db.getAll(STORE_NAME);

      // 计算总缓存大小
      const totalSize = allImages.reduce((sum, img) => sum + img.size, 0);

      // 如果添加新图片后超过限制，删除最旧的图片
      if (totalSize + newImageSize > MAX_CACHE_SIZE) {
        // 按时间戳排序，删除最旧的
        allImages.sort((a, b) => a.timestamp - b.timestamp);

        let freedSize = 0;
        for (const image of allImages) {
          await db.delete(STORE_NAME, image.id);
          freedSize += image.size;

          // 释放足够的空间
          if (totalSize - freedSize + newImageSize <= MAX_CACHE_SIZE) {
            break;
          }
        }
      }
    } catch (error) {
      console.warn('检查缓存大小失败:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    count: number;
    totalSize: number;
    oldestTimestamp: number;
    newestTimestamp: number;
  }> {
    try {
      const db = await this.getDB();
      const allImages = await db.getAll(STORE_NAME);

      if (allImages.length === 0) {
        return {
          count: 0,
          totalSize: 0,
          oldestTimestamp: 0,
          newestTimestamp: 0,
        };
      }

      const totalSize = allImages.reduce((sum, img) => sum + img.size, 0);
      const timestamps = allImages.map(img => img.timestamp);

      return {
        count: allImages.length,
        totalSize,
        oldestTimestamp: Math.min(...timestamps),
        newestTimestamp: Math.max(...timestamps),
      };
    } catch (error) {
      console.warn('获取缓存统计失败:', error);
      return {
        count: 0,
        totalSize: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0,
      };
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

/**
 * 导出单例实例
 */
export const imageCacheService = new ImageCacheService();

/**
 * 默认导出
 */
export default imageCacheService;

/**
 * 在应用启动时清理过期缓存
 */
if (typeof window !== 'undefined') {
  imageCacheService.cleanExpired().catch(console.error);
}
