import { mongoose } from "../services/mongoService";

export interface ITranslationLog {
  userId: string;
  timestamp: Date;
  input_text: string;
  output_text: string;
  ip_address: string;
  request_meta?: Record<string, unknown>;
}

const TranslationLogSchema = new mongoose.Schema<ITranslationLog>(
  {
    userId: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now },
    input_text: { type: String, required: true },
    output_text: { type: String, default: "" },
    ip_address: { type: String, required: true },
    request_meta: { type: mongoose.Schema.Types.Mixed },
  },
  {
    collection: "translation_logs",
    timestamps: false,
  },
);

TranslationLogSchema.index({ userId: 1, timestamp: -1 });

// 90 天 TTL 自动清理（timestamp 到期后自动删除）
TranslationLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// G8-26: 关键词搜索改用 $text 走此索引，替代必然全集合扫描的无锚定 /i 正则。
// default_language "none"：日志是多语种的，英文词干/停用词处理会误伤。
TranslationLogSchema.index(
  { input_text: "text", output_text: "text" },
  { name: "translation_logs_text", default_language: "none" },
);

export const TranslationLogModel =
  (mongoose.models.TranslationLog as mongoose.Model<ITranslationLog>) ||
  mongoose.model<ITranslationLog>("TranslationLog", TranslationLogSchema);
