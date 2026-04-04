import { TranslationLogModel } from "../models/translationLogModel";

export interface TranslationLogEntryInput {
  userId: string;
  input_text: string;
  output_text: string;
  ip_address: string;
  request_meta?: Record<string, unknown>;
}

export class TranslationLogService {
  static async log(entry: TranslationLogEntryInput): Promise<void> {
    await TranslationLogModel.create({
      ...entry,
      timestamp: new Date(),
    });
  }

  static async query(params: {
    page?: number;
    pageSize?: number;
    userId?: string;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const skip = (page - 1) * pageSize;
    const filter: Record<string, unknown> = {};

    if (params.userId && /^[a-zA-Z0-9_-]+$/.test(params.userId)) {
      filter.userId = params.userId;
    }

    if (params.keyword && typeof params.keyword === "string") {
      const keyword = params.keyword.trim().slice(0, 100);
      if (keyword) {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
          { input_text: { $regex: escapedKeyword, $options: "i" } },
          { output_text: { $regex: escapedKeyword, $options: "i" } },
        ];
      }
    }

    if (params.startDate || params.endDate) {
      const timestamp: Record<string, Date> = {};
      if (params.startDate) {
        const start = new Date(params.startDate);
        if (!Number.isNaN(start.getTime())) {
          timestamp.$gte = start;
        }
      }
      if (params.endDate) {
        const end = new Date(params.endDate);
        if (!Number.isNaN(end.getTime())) {
          timestamp.$lte = end;
        }
      }
      if (Object.keys(timestamp).length > 0) {
        filter.timestamp = timestamp;
      }
    }

    const [logs, total] = await Promise.all([
      TranslationLogModel.find(filter).sort({ timestamp: -1 }).skip(skip).limit(pageSize).lean(),
      TranslationLogModel.countDocuments(filter),
    ]);

    return { logs, total, page, pageSize };
  }

  static async getStats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, last24h, topUsers] = await Promise.all([
      TranslationLogModel.estimatedDocumentCount(),
      TranslationLogModel.countDocuments({ timestamp: { $gte: since } }),
      TranslationLogModel.aggregate([
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);

    return {
      total,
      last24h,
      topUsers: topUsers.map((item: { _id: string; count: number }) => ({
        userId: item._id,
        count: item.count,
      })),
    };
  }
}
