import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger';
import { mongoose } from './mongoService';
import type { FilterQuery } from 'mongoose';
import crypto from 'crypto';
import { RiskEvaluationEngine, type DeviceFingerprint } from './riskEvaluationEngine';

// MongoDB 数据收集 Schema（开启 strict 以拒绝未声明字段）
const DataCollectionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  action: { type: String, required: true },
  timestamp: { type: String, required: true },
  details: { type: Object },
  // 智能分析增强字段（可选）
  riskScore: { type: Number, default: 0 },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' },
  analysis: { type: Object },
  hash: { type: String },
  duplicate: { type: Boolean, default: false },
  category: { type: String },
  tags: { type: [String], default: [] },
}, { collection: 'data_collections', strict: true });
const DataCollectionModel = mongoose.models.DataCollection || mongoose.model('DataCollection', DataCollectionSchema);

type StorageMode = 'mongo' | 'file' | 'both';

class DataCollectionService {

  private static instance: DataCollectionService;
  private readonly DATA_DIR = join(process.cwd(), 'data');
  private readonly TEST_DATA_DIR = join(process.cwd(), 'test-data');
  private readonly DATA_FILE = join(this.DATA_DIR, 'collection-data.txt');

  // 智能分析引擎与去重缓存
  private readonly riskEngine = new RiskEvaluationEngine();
  private readonly dedupeTTLms = 10 * 60 * 1000; // 10分钟内视为重复
  private readonly hashSeenAt = new Map<string, number>();
  private readonly rawSecret = process.env.DATA_COLLECTION_RAW_SECRET || '';

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
  private static readonly MAX_STRING_LENGTH = 40960; // 40KB 字符
  private static readonly MAX_DETAILS_BYTES = 5 * 1024 * 1024; // 5MB

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

  // =============== 智能分析与优化 ===============
  private computeHash(obj: any): string {
    const s = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('sha256').update(s).digest('hex');
  }

  private cleanupDedupeCache(now: number) {
    for (const [h, t] of this.hashSeenAt.entries()) {
      if (now - t > this.dedupeTTLms) this.hashSeenAt.delete(h);
    }
  }

  private redactPII(details: any): { redacted: any; piiDetected: boolean; tags: string[] } {
    const clone = JSON.parse(JSON.stringify(details || {}));
    let pii = false;
    const tags: string[] = [];

    // 安全有界正则（避免潜在 ReDoS）
    // 邮箱：本地部分最长64，域名部分最长255，TLD 2-24
    const EMAIL_RE = /([A-Za-z0-9._%+-]{1,64})@(([A-Za-z0-9.-]{1,255})\.[A-Za-z]{2,24})/;
    const EMAIL_GLOBAL_RE = /([A-Za-z0-9._%+-]{1,64})@(([A-Za-z0-9.-]{1,255})\.[A-Za-z]{2,24})/g;
    // 电话（简化）：限制长度范围，避免大重复
    const PHONE_RE = /\+?\d[\d\s-]{7,18}\d/;

    const redactKeys = ['authorization', 'cookie', 'cookies', 'set-cookie', 'password', 'pass', 'token', 'api-key', 'apikey', 'secret'];
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (redactKeys.includes(k.toLowerCase())) {
          o[k] = '[REDACTED]';
          pii = true;
          if (!tags.includes('CREDENTIALS')) tags.push('CREDENTIALS');
          continue;
        }
        if (typeof v === 'string') {
          // 邮箱（安全有界）
          if (EMAIL_RE.test(v)) { pii = true; o[k] = v.replace(EMAIL_GLOBAL_RE, '***@$2'); if (!tags.includes('EMAIL')) tags.push('EMAIL'); }
          // 手机/电话（安全有界简化）
          if (PHONE_RE.test(v)) { pii = true; o[k] = v.replace(/\d/g, '*'); if (!tags.includes('PHONE')) tags.push('PHONE'); }
          // 身份号/卡号（简化掩码）
          if (/\b\d{15,19}\b/.test(v)) { pii = true; o[k] = v.replace(/\d(?=\d{4})/g, '*'); if (!tags.includes('ID')) tags.push('ID'); }
        } else if (typeof v === 'object') {
          walk(v);
        }
      }
    };
    walk(clone);
    return { redacted: clone, piiDetected: pii, tags };
  }

  private classify(action: string, details: any): { category: string; tags: string[] } {
    const tags: string[] = [];
    const a = action.toLowerCase();
    let category = 'general';
    if (a.includes('login') || a.includes('auth')) { category = 'auth'; tags.push('AUTH'); }
    if (a.includes('payment') || a.includes('order')) { category = 'commerce'; tags.push('COMMERCE'); }
    if (a.includes('error') || a.includes('exception')) { category = 'error'; tags.push('ERROR'); }
    if (a.includes('upload') || a.includes('file')) { category = 'file'; tags.push('FILE'); }
    if (details && typeof details === 'object') {
      const headers = (details as any).headers || {};
      const ua = String(headers['user-agent'] || headers['User-Agent'] || '').toLowerCase();
      if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) tags.push('BOT');
    }
    return { category, tags };
  }

  private async evaluateRisk(data: { details: any; ip?: string; userAgent?: string }): Promise<{ riskScore: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; flags: string[] }>{
    try {
      const headers = (data.details || {}).headers || {};
      const ua = String(data.userAgent || headers['user-agent'] || headers['User-Agent'] || 'unknown');
      const ip = String(data.ip || (data.details?.ip) || (data.details?.headers?.['x-forwarded-for']?.split(',')[0]) || '0.0.0.0');
      const device: DeviceFingerprint = {
        canvasEntropy: String(data.details?.device?.canvasEntropy || 'na'),
        userAgent: ua,
        timezone: String(data.details?.device?.timezone || 'UTC'),
        screenResolution: data.details?.device?.screenResolution,
        language: data.details?.device?.language,
        platform: data.details?.device?.platform,
      };
      const behaviorScore = Number(data.details?.behaviorScore ?? 0.5);
      const assessed = await this.riskEngine.assessRisk(ip, device, isNaN(behaviorScore) ? 0.5 : Math.max(0, Math.min(1, behaviorScore)), ua);
      return { riskScore: assessed.overallRisk, riskLevel: assessed.riskLevel, flags: assessed.flags };
    } catch (e) {
      return { riskScore: 0.5, riskLevel: 'LOW', flags: ['EVAL_FALLBACK'] };
    }
  }

  private prepareRecord = async (data: any) => {
    // 先清洗与裁剪，后做敏感信息脱敏、分类与风控评估
    const sanitizedDetails = this.ensureSizeLimit(this.clampDetails(this.sanitizeForMongo(data.details ?? {})));
    const { redacted, piiDetected, tags: piiTags } = this.redactPII(sanitizedDetails);

    const { category, tags: catTags } = this.classify(String(data.action || ''), redacted);
    const hash = this.computeHash({ userId: data.userId, action: data.action, redacted });
    const now = Date.now();
    this.cleanupDedupeCache(now);
    const lastSeen = this.hashSeenAt.get(hash) || 0;
    const duplicate = now - lastSeen < this.dedupeTTLms;
    this.hashSeenAt.set(hash, now);

    const risk = await this.evaluateRisk({ details: redacted });

    const allTags = Array.from(new Set([...(piiTags || []), ...(catTags || []), ...(risk.flags || [])]));

    // 可选：加密存储原始详情（仅管理员后台可解密查看）
    let encryptedRaw: { iv: string; tag: string; data: string } | undefined;
    if (this.rawSecret && typeof data.details !== 'undefined') {
      try {
        const iv = crypto.randomBytes(12);
        const key = crypto.createHash('sha256').update(this.rawSecret).digest();
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const plaintext = Buffer.from(JSON.stringify(data.details), 'utf8');
        const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();
        encryptedRaw = { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
      } catch (e) {
        logger.warn('[DataCollection] encrypt raw failed');
      }
    }

    return {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: redacted,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      analysis: {
        piiDetected,
        duplicate,
        hash,
        flags: risk.flags,
      },
      hash,
      duplicate,
      category,
      tags: allTags,
      encryptedRaw,
    };
  };

  // 仅供后台路由调用：解密原始详情
  public decryptRawDetails(doc: any): any | null {
    try {
      if (!doc?.encryptedRaw || !this.rawSecret) return null;
      const { iv, tag, data } = doc.encryptedRaw;
      const key = crypto.createHash('sha256').update(this.rawSecret).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      const dec = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
      return JSON.parse(dec.toString('utf8'));
    } catch (e) {
      return null;
    }
  }

  private async saveToMongo(data: any): Promise<string> {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB 未连接');
    }
    const doc = {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: data.details,
      riskScore: Number(data.riskScore || 0),
      riskLevel: data.riskLevel || 'LOW',
      analysis: data.analysis || {},
      hash: data.hash || undefined,
      duplicate: Boolean(data.duplicate),
      category: data.category || undefined,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 50) : [],
      encryptedRaw: data.encryptedRaw || undefined,
    } as any;
    const created = await DataCollectionModel.create(doc);
    logger.info('Data saved to MongoDB');
    return (created && (created as any)._id) ? String((created as any)._id) : '';
  }

  private async saveToFile(data: any): Promise<void> {
    const saveDir = process.env.NODE_ENV === 'test' ? this.TEST_DATA_DIR : this.DATA_DIR;
    const saveFile = join(saveDir, `data-${Date.now()}.json`);
    if (!existsSync(saveDir)) {
      await mkdir(saveDir, { recursive: true });
    }
    const serializable = {
      userId: data.userId,
      action: data.action,
      timestamp: data.timestamp,
      details: data.details,
      riskScore: Number(data.riskScore || 0),
      riskLevel: data.riskLevel || 'LOW',
      analysis: data.analysis || {},
      hash: data.hash || undefined,
      duplicate: Boolean(data.duplicate),
      category: data.category || undefined,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 50) : [],
      encryptedRaw: data.encryptedRaw || undefined,
    };
    await writeFile(saveFile, JSON.stringify(serializable, null, 2));
    logger.info('Data saved to local file');
  }

  public async saveData(data: any, mode: StorageMode = 'both'): Promise<{ savedTo: StorageMode | 'mongo_fallback_file'; id?: string }>{
    this.validate(data);
    // 智能预处理与分析
    const prepared = await this.prepareRecord(data);

    if (mode === 'mongo') {
      const id = await this.saveToMongo(prepared);
      return { savedTo: 'mongo', id };
    }
    if (mode === 'file') {
      await this.saveToFile(prepared);
      return { savedTo: 'file' };
    }
    // both: 优先 Mongo，失败则文件兜底
    try {
      const id = await this.saveToMongo(prepared);
      return { savedTo: 'both', id };
    } catch (err) {
      logger.error('MongoDB 保存失败，回退到本地文件:', err);
      await this.saveToFile(prepared);
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

  // 删除全部数据收集记录（管理员）
  public async deleteAll(): Promise<{ deletedCount: number }>{
    if (!this.isMongoReady()) throw new Error('MongoDB 未连接');
    const Model = mongoose.models.DataCollection as any;
    const before = await Model.estimatedDocumentCount();
    const ret = await Model.deleteMany({});
    const deletedCount = typeof ret?.deletedCount === 'number' ? ret.deletedCount : 0;
    logger.info('[DataCollection] deleteAll completed', { before, deletedCount });
    return { deletedCount };
  }

  // Action 版本：封装确认校验与响应体
  public async deleteAllAction(payload: { confirm?: boolean }): Promise<{ statusCode: number; body: any }>{
    if (!payload?.confirm) {
      return { statusCode: 400, body: { success: false, message: 'confirm required' } };
    }
    const { deletedCount } = await this.deleteAll();
    return { statusCode: 200, body: { success: true, deletedCount } };
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