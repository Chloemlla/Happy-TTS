import { mongoose } from './mongoService';
import logger from '../utils/logger';
import crypto from 'crypto';

// 安全工具：转义正则、验证参数
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSafeRegex(input: string, { maxLen = 100, flags = 'i', exact = false }: { maxLen?: number; flags?: string; exact?: boolean } = {}): RegExp {
  const trimmed = String(input).slice(0, maxLen);
  const escaped = escapeRegExp(trimmed);
  const pattern = exact ? `^${escaped}$` : escaped;
  return new RegExp(pattern, flags);
}

function isValidGroup(group: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(group);
}

function isLikelyIPv4(ip: string): boolean {
  return /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/.test(ip);
}

function isValidObjectId(id: string): boolean {
  try {
    return mongoose.Types.ObjectId.isValid(id);
  } catch {
    return false;
  }
}

function isValidUserId(userId: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(userId);
}

// AES-256 加密函数
function encryptAES256(data: string, key: string): { encryptedData: string; iv: string } {
  try {
    const keyHash = crypto.createHash('sha256').update(key).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyHash, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex')
    };
  } catch (error) {
    logger.error('AES-256 加密失败:', error);
    throw new Error('加密失败');
  }
}

// AES-256 解密函数
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    const keyHash = crypto.createHash('sha256').update(key).digest();
    const ivBuffer = Buffer.from(iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, ivBuffer);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('AES-256 解密失败:', error);
    throw new Error('解密失败');
  }
}

// 调试控制台配置接口
interface DebugConsoleConfigDoc {
  enabled: boolean;
  keySequence: string;
  verificationCode: string;
  maxAttempts: number;
  lockoutDuration: number; // 毫秒
  group?: string;
  updatedAt?: Date;
}

// MongoDB Schema（仿照 ChatProviderSchema）
const DebugConsoleConfigSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  keySequence: { type: String, required: true },
  verificationCode: { type: String, required: true },
  maxAttempts: { type: Number, default: 5 },
  lockoutDuration: { type: Number, default: 30 * 60 * 1000 }, // 30分钟
  group: { type: String, default: 'default' },
  updatedAt: { type: Date, default: Date.now },
  // 加密相关字段
  encryptedData: { type: String },
  iv: { type: String }
}, { collection: 'debug_console_configs' });

const DebugConsoleConfigModel = (mongoose.models.DebugConsoleConfig as any) || 
  mongoose.model('DebugConsoleConfig', DebugConsoleConfigSchema);

// 调试控制台访问记录接口
interface DebugConsoleAccessLog {
  userId?: string;
  ip: string;
  userAgent: string;
  keySequence: string;
  verificationCode: string;
  success: boolean;
  attempts: number;
  timestamp: Date;
  lockoutUntil?: Date;
}

// 访问记录 Schema
const DebugConsoleAccessLogSchema = new mongoose.Schema({
  userId: { type: String },
  ip: { type: String, required: true },
  userAgent: { type: String, required: true },
  keySequence: { type: String, required: true },
  verificationCode: { type: String, required: true },
  success: { type: Boolean, required: true },
  attempts: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  lockoutUntil: { type: Date }
}, { collection: 'debug_console_access_logs' });

const DebugConsoleAccessLogModel = (mongoose.models.DebugConsoleAccessLog as any) || 
  mongoose.model('DebugConsoleAccessLog', DebugConsoleAccessLogSchema);

// 调试控制台服务类
class DebugConsoleService {
  private static instance: DebugConsoleService;
  private configCache: DebugConsoleConfigDoc[] = [];
  private configLoadedAt: number = 0;
  private readonly CONFIG_TTL_MS = 60_000; // 1分钟缓存

  private constructor() {
    // 延迟初始化，等待MongoDB服务启动
    setTimeout(() => {
      this.initializeService();
    }, 2000); // 等待2秒让MongoDB服务先启动
    
    // 监听MongoDB连接状态变化
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB连接成功，重新初始化调试控制台服务');
      this.initializeService();
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB连接断开，调试控制台服务将使用默认配置');
    });
  }

  public static getInstance(): DebugConsoleService {
    if (!DebugConsoleService.instance) {
      DebugConsoleService.instance = new DebugConsoleService();
    }
    return DebugConsoleService.instance;
  }

  private async initializeService() {
    try {
      // 检查MongoDB连接状态
      if (mongoose.connection.readyState === 1) {
        await this.loadConfigs();
        logger.info('调试控制台服务初始化成功');
      } else {
        logger.warn('MongoDB 未连接，调试控制台服务将使用默认配置');
        
        // 如果MongoDB未连接，等待一段时间后重试（仅在首次初始化时）
        if (!this.configLoadedAt) {
          setTimeout(async () => {
            if (mongoose.connection.readyState === 1) {
              await this.loadConfigs();
              logger.info('调试控制台服务延迟初始化成功');
            } else {
              logger.warn('MongoDB 仍未连接，调试控制台服务继续使用默认配置');
            }
          }, 5000); // 再等待5秒后重试
        }
      }
    } catch (error) {
      logger.error('调试控制台服务初始化失败:', error);
    }
  }

  private async loadConfigs(): Promise<DebugConsoleConfigDoc[]> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.debug('MongoDB未连接，跳过配置加载');
        return [];
      }
      
      const docs: DebugConsoleConfigDoc[] = await DebugConsoleConfigModel.find({ enabled: { $ne: false } }).lean();
      const normalized = (docs || [])
        .map(d => ({
          enabled: (d as any).enabled !== false,
          keySequence: String((d as any).keySequence || '91781145'),
          verificationCode: String((d as any).verificationCode || '123456'),
          maxAttempts: Number((d as any).maxAttempts || 5),
          lockoutDuration: Number((d as any).lockoutDuration || 30 * 60 * 1000),
          group: String((d as any).group || 'default'),
          updatedAt: (d as any).updatedAt
        }))
        .filter(c => c.keySequence && c.verificationCode);

      this.configCache = normalized;
      this.configLoadedAt = Date.now();
      logger.debug(`调试控制台配置加载完成，共${normalized.length}个配置`);
      return this.configCache;
    } catch (error) {
      logger.error('加载调试控制台配置失败:', error);
      return [];
    }
  }

  private async getConfigsFresh(): Promise<DebugConsoleConfigDoc[]> {
    const now = Date.now();
    
    // 如果MongoDB连接状态发生变化，重新加载配置
    const isConnected = this.isMongoConnected();
    const wasConnected = this.configCache.length > 0 || this.configLoadedAt > 0;
    
    if (!this.configLoadedAt || 
        now - this.configLoadedAt > this.CONFIG_TTL_MS || 
        (isConnected && !wasConnected)) {
      await this.loadConfigs();
    }
    
    return this.configCache;
  }

  /**
   * 验证调试控制台访问
   */
  public async verifyAccess(
    keySequence: string,
    verificationCode: string,
    ip: string,
    userAgent: string,
    userId?: string
  ): Promise<{
    success: boolean;
    message: string;
    attempts: number;
    lockoutUntil?: Date;
    config?: DebugConsoleConfigDoc;
  }> {
    try {
      const configs = await this.getConfigsFresh();
      
      // 如果没有配置，使用默认配置
      if (configs.length === 0) {
        const defaultConfig: DebugConsoleConfigDoc = {
          enabled: true,
          keySequence: '91781145',
          verificationCode: '123456',
          maxAttempts: 5,
          lockoutDuration: 30 * 60 * 1000,
          group: 'default',
          updatedAt: new Date()
        };
        configs.push(defaultConfig);
      }

      // 查找匹配的配置
      const config = configs.find(c => c.keySequence === keySequence);
      if (!config) {
        await this.logAccess({
          userId,
          ip,
          userAgent,
          keySequence,
          verificationCode,
          success: false,
          attempts: 0,
          timestamp: new Date()
        });
        return {
          success: false,
          message: '无效的按键序列',
          attempts: 0
        };
      }

      // 检查是否被锁定
      const lockoutInfo = await this.checkLockout(ip, config);
      if (lockoutInfo.isLocked) {
        await this.logAccess({
          userId,
          ip,
          userAgent,
          keySequence,
          verificationCode,
          success: false,
          attempts: lockoutInfo.attempts,
          lockoutUntil: lockoutInfo.lockoutUntil,
          timestamp: new Date()
        });
        return {
          success: false,
          message: `访问被锁定，请 ${Math.ceil((lockoutInfo.lockoutUntil!.getTime() - Date.now()) / 1000 / 60)} 分钟后再试`,
          attempts: lockoutInfo.attempts,
          lockoutUntil: lockoutInfo.lockoutUntil
        };
      }

      // 验证验证码
      const isValid = verificationCode === config.verificationCode;
      
      if (isValid) {
        // 验证成功，重置尝试次数
        await this.resetAttempts(ip);
        await this.logAccess({
          userId,
          ip,
          userAgent,
          keySequence,
          verificationCode,
          success: true,
          attempts: 0,
          timestamp: new Date()
        });
        
        logger.info('调试控制台访问验证成功', { ip, userId });
        return {
          success: true,
          message: '验证成功',
          attempts: 0,
          config
        };
      } else {
        // 验证失败，增加尝试次数
        const attempts = await this.incrementAttempts(ip, config);
        const remainingAttempts = config.maxAttempts - attempts;
        
        let lockoutUntil: Date | undefined;
        if (remainingAttempts <= 0) {
          lockoutUntil = new Date(Date.now() + config.lockoutDuration);
          await this.setLockout(ip, lockoutUntil);
        }

        await this.logAccess({
          userId,
          ip,
          userAgent,
          keySequence,
          verificationCode,
          success: false,
          attempts,
          lockoutUntil,
          timestamp: new Date()
        });

        logger.warn('调试控制台访问验证失败', { 
          ip, 
          userId, 
          attempts, 
          remainingAttempts,
          lockoutUntil 
        });

        return {
          success: false,
          message: remainingAttempts > 0 
            ? `验证码错误，剩余尝试次数: ${remainingAttempts}`
            : `验证码错误次数过多，已锁定 ${config.lockoutDuration / 1000 / 60} 分钟`,
          attempts,
          lockoutUntil
        };
      }
    } catch (error) {
      logger.error('调试控制台验证失败:', error);
      return {
        success: false,
        message: '验证服务异常',
        attempts: 0
      };
    }
  }

  /**
   * 检查是否被锁定
   */
  private async checkLockout(ip: string, config: DebugConsoleConfigDoc): Promise<{
    isLocked: boolean;
    attempts: number;
    lockoutUntil?: Date;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { isLocked: false, attempts: 0 };
      }

      const lockoutKey = `debug_console_lockout:${ip}`;
      const attemptsKey = `debug_console_attempts:${ip}`;

      // 这里可以使用 Redis 或其他缓存，暂时使用内存存储
      // 在实际生产环境中，建议使用 Redis 来存储锁定状态
      const lockoutUntil = this.getFromCache(lockoutKey);
      const attempts = this.getFromCache(attemptsKey) || 0;

      if (lockoutUntil && Date.now() < lockoutUntil) {
        return {
          isLocked: true,
          attempts,
          lockoutUntil: new Date(lockoutUntil)
        };
      }

      return { isLocked: false, attempts };
    } catch (error) {
      logger.error('检查锁定状态失败:', error);
      return { isLocked: false, attempts: 0 };
    }
  }

  /**
   * 增加尝试次数
   */
  private async incrementAttempts(ip: string, config: DebugConsoleConfigDoc): Promise<number> {
    try {
      const attemptsKey = `debug_console_attempts:${ip}`;
      const currentAttempts = this.getFromCache(attemptsKey) || 0;
      const newAttempts = currentAttempts + 1;
      
      this.setCache(attemptsKey, newAttempts, 60 * 60); // 1小时过期
      return newAttempts;
    } catch (error) {
      logger.error('增加尝试次数失败:', error);
      return 1;
    }
  }

  /**
   * 重置尝试次数
   */
  private async resetAttempts(ip: string): Promise<void> {
    try {
      const attemptsKey = `debug_console_attempts:${ip}`;
      const lockoutKey = `debug_console_lockout:${ip}`;
      
      this.removeFromCache(attemptsKey);
      this.removeFromCache(lockoutKey);
    } catch (error) {
      logger.error('重置尝试次数失败:', error);
    }
  }

  /**
   * 设置锁定状态
   */
  private async setLockout(ip: string, lockoutUntil: Date): Promise<void> {
    try {
      const lockoutKey = `debug_console_lockout:${ip}`;
      const duration = lockoutUntil.getTime() - Date.now();
      this.setCache(lockoutKey, lockoutUntil.getTime(), Math.ceil(duration / 1000));
    } catch (error) {
      logger.error('设置锁定状态失败:', error);
    }
  }

  /**
   * 记录访问日志
   */
  private async logAccess(log: DebugConsoleAccessLog): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await DebugConsoleAccessLogModel.create(log);
      }
    } catch (error) {
      logger.error('记录调试控制台访问日志失败:', error);
    }
  }

  /**
   * 检查MongoDB连接状态
   */
  public isMongoConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  /**
   * 获取服务状态信息
   */
  public getServiceStatus(): {
    mongoConnected: boolean;
    configLoaded: boolean;
    configCount: number;
    lastLoadedAt: number | null;
  } {
    return {
      mongoConnected: this.isMongoConnected(),
      configLoaded: this.configLoadedAt > 0,
      configCount: this.configCache.length,
      lastLoadedAt: this.configLoadedAt || null
    };
  }

  /**
   * 手动重新初始化服务（用于MongoDB连接恢复后）
   */
  public async reinitialize(): Promise<void> {
    logger.info('手动重新初始化调试控制台服务');
    await this.initializeService();
  }

  /**
   * 获取配置列表（管理员接口）
   */
  public async getConfigs(): Promise<DebugConsoleConfigDoc[]> {
    return await this.getConfigsFresh();
  }

  /**
   * 获取加密的配置列表（管理员接口）
   */
  public async getEncryptedConfigs(token: string): Promise<{
    success: boolean;
    data?: DebugConsoleConfigDoc[];
    encryptedData?: string;
    iv?: string;
    error?: string;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { success: false, error: '数据库未连接' };
      }

      const configs = await this.getConfigsFresh();
      
      if (configs.length === 0) {
        return { success: false, error: '没有找到配置' };
      }

      // 加密配置数据
      const configData = JSON.stringify(configs);
      const { encryptedData, iv } = encryptAES256(configData, token);

      return {
        success: true,
        encryptedData,
        iv
      };
    } catch (error) {
      logger.error('获取加密调试控制台配置失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '获取配置失败' 
      };
    }
  }

  /**
   * 更新配置（管理员接口）
   */
  public async updateConfig(
    group: string,
    updates: Partial<DebugConsoleConfigDoc>
  ): Promise<DebugConsoleConfigDoc | null> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB 未连接，无法更新配置');
        return null;
      }

      // 校验 group，防止不受控查询键
      if (!isValidGroup(group)) {
        logger.warn('非法的配置分组标识', { group });
        return null;
      }
      const safeGroup = group.trim();

      // 严格字段白名单与范围校验
      const safeUpdates: Partial<DebugConsoleConfigDoc> = {};

      if (typeof updates.enabled === 'boolean') {
        safeUpdates.enabled = updates.enabled;
      }

      if (typeof updates.keySequence === 'string') {
        // 只允许数字，长度 4-32
        const ks = updates.keySequence.replace(/\D/g, '').slice(0, 32);
        if (ks.length >= 4) safeUpdates.keySequence = ks;
      }

      if (typeof updates.verificationCode === 'string') {
        // 只允许数字，长度 4-12
        const vc = updates.verificationCode.replace(/\D/g, '').slice(0, 12);
        if (vc.length >= 4) safeUpdates.verificationCode = vc;
      }

      if (typeof updates.maxAttempts === 'number') {
        safeUpdates.maxAttempts = Math.max(1, Math.min(20, updates.maxAttempts));
      }

      if (typeof updates.lockoutDuration === 'number') {
        // 最少1分钟，最多24小时
        safeUpdates.lockoutDuration = Math.max(60_000, Math.min(86_400_000, updates.lockoutDuration));
      }

      // 防止空对象（避免只写入 updatedAt）
      const hasAnyField = Object.keys(safeUpdates).length > 0;
      if (!hasAnyField) {
        logger.warn('忽略无有效字段的配置更新');
        return null;
      }

      // 使用 $set 避免操作符注入，并启用 runValidators
      const result = await DebugConsoleConfigModel.findOneAndUpdate(
        { group: safeGroup },
        { $set: { ...safeUpdates, updatedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, context: 'query' }
      );

      // 清除缓存
      this.configLoadedAt = 0;
      
      logger.info('调试控制台配置已更新', { group: safeGroup, updates: safeUpdates });
      return result;
    } catch (error) {
      logger.error('更新调试控制台配置失败:', error);
      return null;
    }
  }

  /**
   * 删除配置（管理员接口）
   */
  public async deleteConfig(group: string): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB 未连接，无法删除配置');
        return false;
      }

      if (!isValidGroup(group)) {
        logger.warn('非法的配置分组标识', { group });
        return false;
      }

      const result = await DebugConsoleConfigModel.deleteOne({ group });
      
      // 清除缓存
      this.configLoadedAt = 0;
      
      logger.info('调试控制台配置已删除', { group, deletedCount: result.deletedCount });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('删除调试控制台配置失败:', error);
      return false;
    }
  }

  /**
   * 获取访问日志（管理员接口）
   */
  public async getAccessLogs(
    page: number = 1,
    limit: number = 50,
    filters: {
      ip?: string;
      success?: boolean;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    logs: DebugConsoleAccessLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { logs: [], total: 0, page, limit };
      }

      const query: any = {};
      
      // 仅允许严格等值匹配，拒绝/忽略无法通过白名单校验的输入
      if (filters.ip) {
        const ipStr = String(filters.ip).trim();
        if (isLikelyIPv4(ipStr)) {
          query.ip = ipStr;
        } // 非法IP将被忽略，不参与查询
      }
      if (filters.success !== undefined) query.success = !!filters.success;
      if (filters.userId) {
        const uid = String(filters.userId).trim();
        if (isValidUserId(uid)) {
          query.userId = uid;
        } // 非法userId将被忽略
      }
      if (filters.startDate || filters.endDate) {
        const range: any = {};
        if (filters.startDate instanceof Date && !isNaN(filters.startDate.getTime())) range.$gte = filters.startDate;
        if (filters.endDate instanceof Date && !isNaN(filters.endDate.getTime())) range.$lte = filters.endDate;
        if (range.$gte || range.$lte) {
          // 限制时间跨度最大为31天
          const startMs = range.$gte ? range.$gte.getTime() : 0;
          const endMs = range.$lte ? range.$lte.getTime() : Date.now();
          const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
          if (endMs >= startMs && (endMs - startMs) <= MAX_RANGE_MS) {
            query.timestamp = range;
          } else {
            logger.warn('忽略超出上限或无效的时间范围过滤', { startMs, endMs });
          }
        }
      }

      const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
      const safePage = Math.max(1, Number(page) || 1);

      const total = await DebugConsoleAccessLogModel.countDocuments(query);
      const logs = await DebugConsoleAccessLogModel
        .find(query)
        .sort({ timestamp: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean();

      return { logs, total, page: safePage, limit: safeLimit };
    } catch (error) {
      logger.error('获取调试控制台访问日志失败:', error);
      return { logs: [], total: 0, page, limit };
    }
  }

  /**
   * 删除单个访问日志（管理员接口）
   */
  public async deleteAccessLog(logId: string): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB 未连接，无法删除访问日志');
        return false;
      }

      if (!isValidObjectId(logId)) {
        logger.warn('非法的访问日志ID', { logId });
        return false;
      }

      const result = await DebugConsoleAccessLogModel.deleteOne({ _id: logId });
      
      logger.info('调试控制台访问日志已删除', { logId, deletedCount: result.deletedCount });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('删除调试控制台访问日志失败:', error);
      return false;
    }
  }

  /**
   * 批量删除访问日志（管理员接口）
   */
  public async deleteAccessLogs(logIds: string[]): Promise<{
    success: boolean;
    deletedCount: number;
    errors: string[];
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB 未连接，无法批量删除访问日志');
        return { success: false, deletedCount: 0, errors: ['MongoDB 未连接'] };
      }

      if (!Array.isArray(logIds) || logIds.length === 0) {
        return { success: false, deletedCount: 0, errors: ['未提供要删除的日志ID'] };
      }

      const validIds = logIds.filter((id) => typeof id === 'string' && isValidObjectId(id));
      const invalidCount = logIds.length - validIds.length;

      if (validIds.length === 0) {
        return { success: false, deletedCount: 0, errors: ['无有效的日志ID'] };
      }

      const result = await DebugConsoleAccessLogModel.deleteMany({ _id: { $in: validIds } });
      
      logger.info('调试控制台访问日志批量删除完成', { 
        totalRequested: logIds.length,
        valid: validIds.length,
        invalid: invalidCount,
        deletedCount: result.deletedCount 
      });
      
      return { 
        success: true, 
        deletedCount: result.deletedCount,
        errors: invalidCount > 0 ? [`忽略无效ID数量: ${invalidCount}`] : []
      };
    } catch (error) {
      logger.error('批量删除调试控制台访问日志失败:', error);
      return { 
        success: false, 
        deletedCount: 0, 
        errors: [error instanceof Error ? error.message : '未知错误'] 
      };
    }
  }

  /**
   * 删除所有访问日志（管理员接口）
   */
  public async deleteAllAccessLogs(): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB 未连接，无法删除所有访问日志');
        return { success: false, deletedCount: 0, error: 'MongoDB 未连接' };
      }

      const result = await DebugConsoleAccessLogModel.deleteMany({});
      
      logger.info('所有调试控制台访问日志已删除', { deletedCount: result.deletedCount });
      
      return { 
        success: true, 
        deletedCount: result.deletedCount 
      };
    } catch (error) {
      logger.error('删除所有调试控制台访问日志失败:', error);
      return { 
        success: false, 
        deletedCount: 0, 
        error: error instanceof Error ? error.message : '未知错误' 
      };
    }
  }

  /**
   * 根据条件删除访问日志（管理员接口）
   * 现在用于删除选中的日志
   */
  public async deleteAccessLogsByFilter(data: {
    logIds?: string[];
    filters?: {
      ip?: string;
      success?: boolean;
      userId?: string;
      startDate?: string | Date;
      endDate?: string | Date;
    };
  }): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB 未连接，无法删除访问日志');
        return { success: false, deletedCount: 0, error: 'MongoDB 未连接' };
      }

      // 优先处理选中的日志ID
      if (data.logIds && Array.isArray(data.logIds) && data.logIds.length > 0) {
        const validIds = data.logIds.filter((id) => typeof id === 'string' && isValidObjectId(id));
        const invalidCount = data.logIds.length - validIds.length;

        if (validIds.length === 0) {
          return { success: false, deletedCount: 0, error: '无有效的日志ID' };
        }

        const result = await DebugConsoleAccessLogModel.deleteMany({ _id: { $in: validIds } });
        
        logger.info('删除选中的调试控制台访问日志完成', { 
          totalRequested: data.logIds.length,
          valid: validIds.length,
          invalid: invalidCount,
          deletedCount: result.deletedCount 
        });
        
        return { 
          success: true, 
          deletedCount: result.deletedCount 
        };
      }

      // 如果没有选中日志，则处理过滤条件（向后兼容）
      if (data.filters) {
        const query: any = {};
        
        // 仅允许严格等值匹配，拒绝非法过滤条件
        if (data.filters.ip) {
          const ipStr = String(data.filters.ip).trim();
          if (!isLikelyIPv4(ipStr)) {
            return { success: false, deletedCount: 0, error: '非法IP过滤条件' };
          }
          query.ip = ipStr;
        }
        if (data.filters.success !== undefined) query.success = !!data.filters.success;
        if (data.filters.userId) {
          const uid = String(data.filters.userId).trim();
          if (!isValidUserId(uid)) {
            return { success: false, deletedCount: 0, error: '非法userId过滤条件' };
          }
          query.userId = uid;
        }
        if (data.filters.startDate || data.filters.endDate) {
          const range: any = {};
          
          // 处理 startDate
          if (data.filters.startDate) {
            const startDate = typeof data.filters.startDate === 'string' ? new Date(data.filters.startDate) : data.filters.startDate;
            if (startDate instanceof Date && !isNaN(startDate.getTime())) {
              range.$gte = startDate;
            }
          }
          
          // 处理 endDate
          if (data.filters.endDate) {
            const endDate = typeof data.filters.endDate === 'string' ? new Date(data.filters.endDate) : data.filters.endDate;
            if (endDate instanceof Date && !isNaN(endDate.getTime())) {
              range.$lte = endDate;
            }
          }
          
          if (range.$gte || range.$lte) {
            // 限制删除操作的时间范围最大为31天
            const startMs = range.$gte ? range.$gte.getTime() : 0;
            const endMs = range.$lte ? range.$lte.getTime() : Date.now();
            const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
            if (endMs >= startMs && (endMs - startMs) <= MAX_RANGE_MS) {
              query.timestamp = range;
            } else {
              return { success: false, deletedCount: 0, error: '时间范围无效或跨度过大（>31天）' };
            }
          }
        }

        // 如果没有过滤条件，则删除所有日志（需要特别小心）
        if (Object.keys(query).length === 0) {
          logger.warn('根据条件删除访问日志：未提供过滤条件，将删除所有日志', { filters: data.filters });
        }

        const result = await DebugConsoleAccessLogModel.deleteMany(query);
        
        logger.info('根据条件删除调试控制台访问日志完成', { 
          filters: data.filters, 
          deletedCount: result.deletedCount 
        });
        
        return { 
          success: true, 
          deletedCount: result.deletedCount 
        };
      }

      // 如果既没有选中日志也没有过滤条件，返回错误
      return { success: false, deletedCount: 0, error: '未提供要删除的日志ID或过滤条件' };
    } catch (error) {
      logger.error('删除调试控制台访问日志失败:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        data
      });
      return { 
        success: false, 
        deletedCount: 0, 
        error: error instanceof Error ? error.message : '未知错误' 
      };
    }
  }

  // 简单的内存缓存实现（生产环境建议使用 Redis）
  private cache = new Map<string, { value: any; expires: number }>();

  private getFromCache(key: string): any {
    const item = this.cache.get(key);
    if (item && Date.now() < item.expires) {
      return item.value;
    }
    if (item) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache(key: string, value: any, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000
    });
  }

  private removeFromCache(key: string): void {
    this.cache.delete(key);
  }
}

export const debugConsoleService = DebugConsoleService.getInstance();
export type { DebugConsoleConfigDoc, DebugConsoleAccessLog }; 