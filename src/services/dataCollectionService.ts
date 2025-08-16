import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger';
import { mongoose } from './mongoService';
import type { FilterQuery } from 'mongoose';

// MongoDB 数据收集 Schema（开启 strict 以拒绝未声明字段）
const DataCollectionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  action: { type: String, required: true },
  timestamp: { type: String, required: true },
  details: { type: Object },
}, { collection: 'data_collections', strict: true });
const DataCollectionModel = mongoose.models.DataCollection || mongoose.model('DataCollection', DataCollectionSchema);

type StorageMode = 'mongo' | 'file' | 'both';

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
        logger.info('Created data directory for data collection');
      }
    } catch (error) {
      logger.error('Error initializing data collection service:', error);
    }
  }

  // 递归清洗：
  // - 移除以 $ 开头的键（Mongo 操作符）
  // - 替换键名中的 . 为 _（禁止路径展开）
  // - 限制键名长度与字符集
  // - 规避循环引用
  // - 归一化非序列化类型（函数、Symbol、BigInt、非有限数字等）
  private static readonly MAX_KEY_LENGTH = 128;
  private sanitizeForMongo(input: any, seen = new WeakSet<object>()): any {
    if (input === null || input === undefined) return input;
    const t = typeof input;
    if (t === 'number') return Number.isFinite(input) ? input : String(input);
    if (t === 'bigint') return input.toString();
    if (t === 'function' || t === 'symbol') return String(input);
    if (t !== 'object') return input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input as object);
    if (Array.isArray(input)) return input.map((v) => this.sanitizeForMongo(v, seen));
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (!k) continue;
      // 丢弃可疑/危险键：Mongo 操作符与原型污染相关键
      if (k[0] === '$') continue;
      if (k === '__proto__' || k === 'prototype' || k === 'constructor') continue;
      // 限制键名长度与字符集（只保留可见字符），并替换点
      let safeKey = k.replace(/\./g, '_').replace(/[^\x20-\x7E]/g, '_');
      if (safeKey.length > DataCollectionService.MAX_KEY_LENGTH) {
        safeKey = safeKey.slice(0, DataCollectionService.MAX_KEY_LENGTH);
      }
      out[safeKey] = this.sanitizeForMongo(v, seen);
    }
    return out;
  }

  // 统一限制：深度、键数量、数组长度、字符串长度与整体大小
  private static readonly MAX_DEPTH = 6;
  private static readonly MAX_KEYS_PER_OBJECT = 200;
  private static readonly MAX_ARRAY_LENGTH = 200;
  private static readonly MAX_STRING_LENGTH = 4096; // 4KB 字符
  private static readonly MAX_DETAILS_BYTES = 256 * 1024; // 256KB

  private clampDetails(input: any, depth = 0, seen = new WeakSet<object>()): any {
    if (input === null || input === undefined) return input;
    if (depth > DataCollectionService.MAX_DEPTH) return '[Truncated: depth limit]';
    const t = typeof input;
    if (t === 'string') {
      return (input as string).length > DataCollectionService.MAX_STRING_LENGTH
        ? (input as string).slice(0, DataCollectionService.MAX_STRING_LENGTH) + '…'
        : input;
    }
    if (t !== 'object') return input;
    if (seen.has(input)) return '[Circular]';
    seen.add(input as object);
    if (Array.isArray(input)) {
      const arr = input
        .slice(0, DataCollectionService.MAX_ARRAY_LENGTH)
        .map((v) => this.clampDetails(v, depth + 1, seen));
      if (input.length > DataCollectionService.MAX_ARRAY_LENGTH) arr.push('[Truncated: array length]');
      return arr;
    }
    // object
    const out: Record<string, any> = {};
    let count = 0;
    for (const [k, v] of Object.entries(input)) {
      out[k] = this.clampDetails(v, depth + 1, seen);
      count++;
      if (count >= DataCollectionService.MAX_KEYS_PER_OBJECT) {
        out['__truncated__'] = 'object keys limit reached';
        break;
      }
    }
    return out;
  }

  private ensureSizeLimit(obj: any): any {
    // 如果超过上限，逐步降采样：移除 headers/cookies 等大字段
    const tryStringify = (o: any) => JSON.stringify(o);
    const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
    let current = obj;
    let s = tryStringify(current);
    if (bytes(s) <= DataCollectionService.MAX_DETAILS_BYTES) return current;
    // 尝试移除常见大字段
    const dropList = ['headers', 'cookies', 'payload_raw', 'raw', 'body'];
    if (current && typeof current === 'object') {
      const clone = { ...current } as any;
      for (const key of dropList) {
        if (clone[key] !== undefined) delete clone[key];
      }
      s = tryStringify(clone);
      if (bytes(s) <= DataCollectionService.MAX_DETAILS_BYTES) return clone;
      // 仍超限，最后退化为简短提示
      return { note: 'details truncated due to size limit' };
    }
    return { note: 'details truncated due to size limit' };
  }

  private validate(data: any) {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的数据格式');
    }
    if (!data.userId || !data.action || !data.timestamp) {
      throw new Error('缺少必需字段');
    }
    const idPattern = /^[a-zA-Z0-9_\-:@.]{1,128}$/;
    if (typeof data.userId !== 'string' || !idPattern.test(data.userId)) {
      throw new Error('userId 非法');
    }
    const actionPattern = /^[a-zA-Z0-9_\-:.]{1,128}$/;
    if (typeof data.action !== 'string' || !actionPattern.test(data.action)) {
      throw new Error('action 非法');
    }
    // 简单 ISO-8601 校验（允许毫秒与 Z 后缀）
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
    if (typeof data.timestamp !== 'string' || data.timestamp.length > 64 || !isoPattern.test(data.timestamp)) {
      throw new Error('timestamp 非法');
    }
  }

  private async saveToMongo(data: any): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB 未连接');
    }
    const sanitized = {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: this.ensureSizeLimit(this.clampDetails(this.sanitizeForMongo(data.details ?? {}))),
    };
    await DataCollectionModel.create(sanitized);
    logger.info('Data saved to MongoDB');
  }

  private async saveToFile(data: any): Promise<void> {
    const saveDir = process.env.NODE_ENV === 'test' ? this.TEST_DATA_DIR : this.DATA_DIR;
    const saveFile = join(saveDir, `data-${Date.now()}.json`);
    if (!existsSync(saveDir)) {
      await mkdir(saveDir, { recursive: true });
    }
    const sanitized = {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: this.ensureSizeLimit(this.clampDetails(this.sanitizeForMongo(data.details ?? {}))),
    };
    await writeFile(saveFile, JSON.stringify(sanitized, null, 2));
    logger.info('Data saved to local file');
  }

  public async saveData(data: any, mode: StorageMode = 'both'): Promise<{ savedTo: StorageMode | 'mongo_fallback_file' }>{
    this.validate(data);
    if (mode === 'mongo') {
      await this.saveToMongo(data);
      return { savedTo: 'mongo' };
    }
    if (mode === 'file') {
      await this.saveToFile(data);
      return { savedTo: 'file' };
    }
    // both: 优先 Mongo，失败则文件兜底
    try {
      await this.saveToMongo(data);
      return { savedTo: 'both' };
    } catch (err) {
      logger.error('MongoDB 保存失败，回退到本地文件:', err);
      await this.saveToFile(data);
      return { savedTo: 'mongo_fallback_file' };
    }
  }

  // =============== Admin management helpers (Mongo only) ===============
  public isMongoReady(): boolean {
    return mongoose.connection.readyState === 1;
  }

  public async list(params: {
    page?: number; limit?: number;
    userId?: string; action?: string;
    start?: string; end?: string;
    sort?: 'desc' | 'asc';
  }): Promise<{ items: any[]; total: number; page: number; limit: number }>{
    if (!this.isMongoReady()) throw new Error('MongoDB 未连接');
    const Model = mongoose.models.DataCollection as any;
    const { page: _page = 1, limit: _limit = 20, userId, action, start, end, sort = 'desc' } = params || {};

    // 安全分页参数
    const safePage = Number.isFinite(_page as number) ? Math.max(1, Math.floor(_page as number)) : 1;
    const safeLimitRaw = Number.isFinite(_limit as number) ? Math.max(1, Math.floor(_limit as number)) : 20;
    const safeLimit = Math.min(100, safeLimitRaw); // 限制最大每页100

    const query: FilterQuery<any> = {};
    // 仅允许字符串等值匹配，避免操作符注入
    if (typeof userId === 'string') query.userId = String(userId);
    if (typeof action === 'string') query.action = String(action);

    // timestamp 过滤（ISO 字符串）；只接受有效日期
    const isValidISO = (s?: string) => !!s && !isNaN(Date.parse(s));
    if (isValidISO(start) || isValidISO(end)) {
      query.timestamp = {} as any;
      if (isValidISO(start)) (query.timestamp as any).$gte = new Date(start as string).toISOString();
      if (isValidISO(end)) (query.timestamp as any).$lte = new Date(end as string).toISOString();
    }

    const skip = (safePage - 1) * safeLimit;
    const total = await Model.countDocuments(query);
    const items = await Model.find(query)
      .sort({ timestamp: sort === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();
    return { items, total, page: safePage, limit: safeLimit };
  }

  public async getById(id: string): Promise<any | null> {
    if (!this.isMongoReady()) throw new Error('MongoDB 未连接');
    const Model = mongoose.models.DataCollection as any;
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Model.findById(id).lean();
  }

  public async deleteById(id: string): Promise<{ deleted: boolean }>{
    if (!this.isMongoReady()) throw new Error('MongoDB 未连接');
    const Model = mongoose.models.DataCollection as any;
    if (!mongoose.Types.ObjectId.isValid(id)) return { deleted: false };
    const res = await Model.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    return { deleted: res.deletedCount > 0 };
  }

  public async deleteBatch(ids: string[]): Promise<{ deletedCount: number }>{
    if (!this.isMongoReady()) throw new Error('MongoDB 未连接');
    const Model = mongoose.models.DataCollection as any;
    const validIds = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && mongoose.Types.ObjectId.isValid(x))
      .map((x) => new mongoose.Types.ObjectId(x as string));
    if (validIds.length === 0) return { deletedCount: 0 };
    const res = await Model.deleteMany({ _id: { $in: validIds } });
    return { deletedCount: res.deletedCount || 0 };
  }

  public async stats() {
    if (!this.isMongoReady()) throw new Error('MongoDB 未连接');
    const Model = mongoose.models.DataCollection as any;
    const total = await Model.estimatedDocumentCount();
    // count by action
    const byAction = await Model.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    // last 7 days histogram by date (based on ISO strings -> convert to Date)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const last7days = await Model.aggregate([
      { $match: { timestamp: { $gte: sevenDaysAgo } } },
      { $addFields: { tsDate: { $toDate: '$timestamp' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$tsDate' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    return { total, byAction, last7days };
  }
}

export const dataCollectionService = DataCollectionService.getInstance();