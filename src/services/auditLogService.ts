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
      // 审计写入失败不应影响业务，仅记录到通用日志
      logger.error('[AuditLog] 写入失败', { err, entry });
    }
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
      module,
      action,
      userId,
      result,
      startDate,
      endDate,
      keyword,
    } = params;

    const filter: Record<string, any> = {};

    if (module) filter.module = module;
    if (action) filter.action = action;
    if (userId) filter.userId = userId;
    if (result) filter.result = result;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (keyword) {
      // 转义正则特殊字符，防止 ReDoS / NoSQL 注入
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { action: { $regex: escaped, $options: 'i' } },
        { targetName: { $regex: escaped, $options: 'i' } },
        { ip: { $regex: escaped, $options: 'i' } },
      ];
    }

    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeSize)
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
      byModule: byModule.map(m => ({ module: m._id, count: m.count })),
      byResult: byResult.map(r => ({ result: r._id, count: r.count })),
      last24h: recentCount,
      total: await AuditLogModel.estimatedDocumentCount(),
    };
  }
}
