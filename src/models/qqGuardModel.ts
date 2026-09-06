import mongoose from "mongoose";

export const QQ_GUARD_VERDICTS = ["violated", "clean", "undetermined"] as const;
export type QqGuardVerdict = (typeof QQ_GUARD_VERDICTS)[number];

/** 审计事件类型（bot 侧 pushAudit 与 /moderate 共用）。 */
export type QqGuardAuditEvent =
  | "message"
  | "moderate"
  | "violation"
  | "recalled"
  | "recall_failed"
  | "dm"
  | "dm_sent"
  | "dm_suppressed"
  | "dm_failed"
  | "pass"
  | "review_pending"
  | "review_clean"
  | "review_violated"
  | "exempted"
  | "command"
  | "bot_offline"
  | "bot_recovered";

export interface QqGuardAuditDoc {
  /** bot 每次回推生成的幂等键：唯一稀疏索引，配合 upsert 使补推重试不产生重复行。 */
  eventId?: string;
  traceId: string;
  event: QqGuardAuditEvent;
  groupId?: string;
  userId?: string;
  messageId?: string;
  content?: string;
  verdict?: QqGuardVerdict;
  reason?: string;
  httpCode?: number;
  attempt?: number;
  action?: string;
  status?: string;
  error?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

export interface QqGuardWhitelistDoc {
  userId: string;
  groupId: string;
  name?: string;
  reason?: string;
  addedBy: string;
  createdAt: Date;
}

export type QqGuardCommandAction = "retry" | "recall" | "exempt";

export interface QqGuardCommandDoc {
  commandId: string;
  action: QqGuardCommandAction;
  payload: Record<string, unknown>;
  status: "pending" | "done" | "failed";
  result?: Record<string, unknown>;
  createdBy?: string;
  createdAt: Date;
  ackedAt?: Date;
}

const auditSchema = new mongoose.Schema<QqGuardAuditDoc>(
  {
    traceId: { type: String, required: true, index: true },
    eventId: { type: String, index: true },
    event: { type: String, required: true, index: true },
    groupId: { type: String, index: true },
    userId: { type: String, index: true },
    messageId: { type: String },
    content: { type: String },
    verdict: { type: String, enum: [...QQ_GUARD_VERDICTS] },
    reason: { type: String },
    httpCode: { type: Number },
    attempt: { type: Number },
    action: { type: String },
    status: { type: String },
    error: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { collection: "qq_guard_audit", timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });
auditSchema.index({ groupId: 1, createdAt: -1 });
auditSchema.index({ traceId: 1, createdAt: 1 });
// bot 补推重试幂等：同一 eventId 只落一条。稀疏——老数据无该字段不参与唯一约束。
auditSchema.index({ eventId: 1 }, { unique: true, sparse: true });

const whitelistSchema = new mongoose.Schema<QqGuardWhitelistDoc>(
  {
    userId: { type: String, required: true, index: true },
    groupId: { type: String, required: true, index: true },
    name: { type: String },
    reason: { type: String },
    addedBy: { type: String, required: true },
  },
  { collection: "qq_guard_whitelist", timestamps: { createdAt: true, updatedAt: false } },
);
whitelistSchema.index({ userId: 1, groupId: 1 }, { unique: true });

const commandSchema = new mongoose.Schema<QqGuardCommandDoc>(
  {
    commandId: { type: String, required: true, unique: true, index: true },
    action: { type: String, enum: ["retry", "recall", "exempt"], required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["pending", "done", "failed"], default: "pending", index: true },
    result: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: String },
    ackedAt: { type: Date },
  },
  { collection: "qq_guard_commands", timestamps: { createdAt: true, updatedAt: false } },
);
commandSchema.index({ status: 1, createdAt: 1 });

export const QqGuardAuditModel =
  (mongoose.models.QqGuardAudit as mongoose.Model<QqGuardAuditDoc>) ||
  mongoose.model<QqGuardAuditDoc>("QqGuardAudit", auditSchema);
export const QqGuardWhitelistModel =
  (mongoose.models.QqGuardWhitelist as mongoose.Model<QqGuardWhitelistDoc>) ||
  mongoose.model<QqGuardWhitelistDoc>("QqGuardWhitelist", whitelistSchema);
export const QqGuardCommandModel =
  (mongoose.models.QqGuardCommand as mongoose.Model<QqGuardCommandDoc>) ||
  mongoose.model<QqGuardCommandDoc>("QqGuardCommand", commandSchema);