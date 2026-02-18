import { AuditLogModel, IAuditLog } from '../models/auditLogModel';
import logger from '../utils/logger';

export interface AuditEntry {
  userId: string;
  username: string;
  role: string;
  action: string;
  module: IAuditLog['module'];
  targetId?: string;
  targetName?: string;
  result: 'success' | 'failure';
  errorMessage?: string;
  detail?: Record<string, any>;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, (ch) => '\\' + ch);
}

/** 允许的模块白名单 */
const ALLOWED_MODULES = new Set([
  'auth', 'user', 'system', 'cdk', 'api', 'admin', 'security',
  'config', 'email', 'tts', 'shorturl', 'ipfs', 'media', 'network',
  'life', 'social', 'lottery', 'workspace', 'resource',
  'recommendation', 'policy', 'debug',
]);

const ALLOWED_RESULTS = new Set(['success', 'failure']);

export class AuditLogService {
  /**
   * 写入一条审计日志（fire-and-forget，不阻塞业务）
   */
  static async log(entry: AuditEntry): Promise<void> {
    try {
      await AuditLogModel.create({
        ...entry,
        createdAt: new Date(),
      });
    } catch (err) {
      logger.error('[AuditLog] 写入失败', { err, entry });
    }
  }

  /**
   * 构建安全的静态过滤条件（不含任何用户可控字符串）
   */
  private static buildStaticFilter(params: {
    module?: string;
    action?: string;
    userId?: string;
    result?: string;
    startDate?: string;
    endDate?: string;
  }): Record<string, any> {
    const filter: Record<string, any> = {};

    if (params.module && ALLOWED_MODULES.has(params.module)) {
      filter.module = params.module;
    }
    if (params.action && /^[a-zA-Z0-9_.-]+$/.test(params.action)) {
      filter.action = String(params.action);
    }
    if (params.userId && /^[a-zA-Z0-9_-]+$/.test(params.userId)) {
      filter.userId = String(params.userId);
    }
    if (params.result && ALLOWED_RESULTS.has(params.result)) {
      filter.result = params.result;
    }

    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) {
        const d = new Date(params.startDate);
        if (!isNaN(d.getTime())) dateFilter.$gte = d;
      }
      if (params.endDate) {
        const d = new Date(params.endDate);
        if (!isNaN(d.getTime())) dateFilter.$lte = d;
      }
      if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;
    }

    return filter;
  }

  /**
   * 将 keyword 净化为纯字母数字（彻底切断污点链）
   */
  private static sanitizeKeyword(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    // 只保留字母、数字、空格、@、.、-、_，最长 100 字符
    const cleaned = raw.replace(/[^a-zA-Z0-9\u4e00-\u9fff @._-]/g, '').slice(0, 100);
    return cleaned.length > 0 ? cleaned : null;
  }

  /**
   * 分页查询审计日志
   */
  static async query(params: {
    page?: number;
    pageSize?: number;
    module?: string;
    action?: string;
    userId?: string;
    result?: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  }) {
    const {
      page = 1,
      pageSize = 20,
    } = params;

    // 静态过滤条件（白名单校验，不含用户可控字符串）
    const filter = AuditLogService.buildStaticFilter(params);

    // keyword 搜索：净化后构造 RegExp 对象
    const safeKeyword = AuditLogService.sanitizeKeyword(params.keyword);
    if (safeKeyword) {
      const re = new RegExp(escapeRegex(safeKeyword), 'i');
      filter.$or = [
        { username: re },
        { action: re },
        { targetName: re },
        { ip: re },
      ];
    }

    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const skip = (safePage - 1) * safeSize;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeSize)
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return { logs, total, page: safePage, pageSize: safeSize };
  }

  /**
   * 获取模块和操作类型的聚合统计
   */
  static async getStats() {
    const [byModule, byResult, recentCount] = await Promise.all([
      AuditLogModel.aggregate([
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLogModel.aggregate([
        { $group: { _id: '$result', count: { $sum: 1 } } },
      ]),
      AuditLogModel.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    return {
      byModule: byModule.map((m: { _id: string; count: number }) => ({ module: m._id, count: m.count })),
      byResult: byResult.map((r: { _id: string; count: number }) => ({ result: r._id, count: r.count })),
      last24h: recentCount,
      total: await AuditLogModel.estimatedDocumentCount(),
    };
  }
}
