import mongoose, { type Document, Schema } from "mongoose";

export interface ITamperEvent extends Document {
  eventId: string;
  elementId?: string;
  timestamp: Date;
  clientTimestamp?: string;
  url: string;
  ip?: string;
  userAgent?: string;
  eventType?: string;
  tamperType?: "dom" | "network" | "proxy" | "injection";
  detectionMethod?: string;
  originalContent?: string;
  tamperContent?: string;
  filePath?: string;
  checksum?: string;
  attempts?: number;
  additionalInfo?: Record<string, unknown>;
  severity?: "low" | "medium" | "high" | "critical";
  signed?: boolean;
  expiresAt: Date;
}

const tamperEventSchema = new Schema<ITamperEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    elementId: { type: String },
    timestamp: { type: Date, required: true },
    clientTimestamp: { type: String },
    url: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
    eventType: { type: String },
    tamperType: { type: String, enum: ["dom", "network", "proxy", "injection"] },
    detectionMethod: { type: String },
    originalContent: { type: String },
    tamperContent: { type: String },
    filePath: { type: String },
    checksum: { type: String },
    attempts: { type: Number, min: 0 },
    additionalInfo: { type: Schema.Types.Mixed },
    severity: { type: String, enum: ["low", "medium", "high", "critical"] },
    signed: { type: Boolean },
    expiresAt: { type: Date, required: true },
  },
  { collection: "tamper_events", timestamps: false },
);

// 事件列表按时间倒序分页；封禁判定按 IP + 时间窗口计数。
tamperEventSchema.index({ timestamp: -1 });
tamperEventSchema.index({ ip: 1, timestamp: -1 });
tamperEventSchema.index({ tamperType: 1, timestamp: -1 });
// 每条事件自带绝对过期时间，TTL 索引按该时间回收（缺少该字段的文档不会被清理）。
tamperEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TamperEventModel =
  (mongoose.models.TamperEvent as mongoose.Model<ITamperEvent>) ||
  mongoose.model<ITamperEvent>("TamperEvent", tamperEventSchema);
