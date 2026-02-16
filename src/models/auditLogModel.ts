import { mongoose } from '../services/mongoService';

export interface IAuditLog {
  /** 操作者 ID */
  userId: string;
  /** 操作者用户名 */
  username: string;
  /** 操作者角色 */
  role: string;
  /** 操作类型，如 user.create / cdk.delete / ipban.create */
  action: string;
  /** 操作模块分类 */
  module: 'user' | 'cdk' | 'shorturl' | 'ipban' | 'env' | 'announcement' | 'system' | 'auth' | 'other';
  /** 操作目标标识（如被操作的用户ID、CDK ID等） */
  targetId?: string;
  /** 操作目标描述 */
  targetName?: string;
  /** 操作结果 */
  result: 'success' | 'failure';
  /** 失败原因 */
  errorMessage?: string;
  /** 操作详情（变更前后等） */
  detail?: Record<string, any>;
  /** 请求 IP */
  ip: string;
  /** User-Agent */
  userAgent?: string;
  /** 请求路径 */
  path?: string;
  /** 请求方法 */
  method?: string;
  /** 创建时间 */
  createdAt: Date;
}

const AuditLogSchema = new mongoose.Schema<IAuditLog>({
  userId:      { type: String, required: true, index: true },
  username:    { type: String, required: true },
  role:        { type: String, required: true },
  action:      { type: String, required: true, index: true },
  module:      { type: String, required: true, index: true },
  targetId:    { type: String },
  targetName:  { type: String },
  result:      { type: String, required: true, enum: ['success', 'failure'] },
  errorMessage:{ type: String },
  detail:      { type: mongoose.Schema.Types.Mixed },
  ip:          { type: String, required: true },
  userAgent:   { type: String },
  path:        { type: String },
  method:      { type: String },
  createdAt:   { type: Date, default: Date.now },
}, {
  collection: 'audit_logs',
  timestamps: false,
});

// 查询索引
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ module: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

// 90 天 TTL 自动清理
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AuditLogModel = (mongoose.models.AuditLog as mongoose.Model<IAuditLog>) ||
  mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
