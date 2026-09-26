/**
 * 扫码登录客户端长效令牌（sml_）的 Mongo 存储。
 * G2-18: 从 data/mobile_login_client_tokens.json 迁到独立集合，
 * tokenHash 唯一索引 + expiresAt TTL 索引，读写改为单文档原子操作。
 */
import { mongoose } from "../services/mongoService";

export interface MobileClientTokenDoc {
  tokenHash: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  lastUsedIp?: string;
  revokedAt?: number;
  ttlExpireAt?: Date;
  /**
   * 令牌血缘：一次“登录→（每日）轮换”链条的标识。
   * 签发时新建，轮换时继承；旧令牌被再次使用就能按它整链吊销。
   */
  lineageId?: string;
  /** 第几代，签发为 0，每轮换一次 +1。 */
  rotationIndex?: number;
  /** 本代被哪一代顶替（上一代 tokenHash），仅用于审计回溯。 */
  rotatedFrom?: string;
  /** 本代被轮换掉的时间；过了宽限期再被使用 = 令牌泄露信号。 */
  supersededAt?: number;
  /** 接棒令牌的 hash，便于定位“真正的那一张”。 */
  supersededTo?: string;
  /** 发生轮换时的来源 IP / 指纹，仅做取证。 */
  rotatedIp?: string;
  rotatedFingerprint?: string;
  /**
   * 设备标识（`deviceId`+`deviceName` 的哈希）。用来判断"这台设备在该账号上有多新"，
   * 光看 `deviceId` 挡不住"自报原 deviceId 但换机器名"的重放。
   */
  deviceFingerprint?: string;
  /** 该设备首次出现在这个账号上的时间戳（跨代继承）。 */
  deviceFirstSeenAt?: number;
  /**
   * 本代是在设备证明未通过的情况下签发的，还没有等到一次通过的证明。
   * P3 据此把后续几代留在提级节奏上。
   */
  verificationPending?: boolean;
  /** 本代被轮换掉时命中的风险信号，仅做审计与后台聚合。 */
  riskSignals?: string[];
}

const mobileClientTokenSchema = new mongoose.Schema<MobileClientTokenDoc>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    deviceId: { type: String },
    deviceName: { type: String },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    lastUsedAt: { type: Number },
    lastUsedIp: { type: String },
    revokedAt: { type: Number },
    lineageId: { type: String },
    rotationIndex: { type: Number },
    rotatedFrom: { type: String },
    supersededAt: { type: Number },
    supersededTo: { type: String },
    rotatedIp: { type: String },
    rotatedFingerprint: { type: String },
    deviceFingerprint: { type: String },
    deviceFirstSeenAt: { type: Number },
    verificationPending: { type: Boolean },
    riskSignals: { type: [String] },
  },
  { collection: "mobile_client_tokens" },
);

// TTL 索引：Mongo TTL 需要 Date 字段，这里用 ttlExpireAt 承载，由服务在写入时填充。
mobileClientTokenSchema.add({
  ttlExpireAt: { type: Date },
});
mobileClientTokenSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });
mobileClientTokenSchema.index({ tokenHash: 1 }, { unique: true });
mobileClientTokenSchema.index({ userId: 1, revokedAt: 1 });
// 整链吊销与“24 小时内轮换次数”统计走这两个索引。
mobileClientTokenSchema.index({ userId: 1, lineageId: 1, createdAt: -1 });
mobileClientTokenSchema.index({ supersededTo: 1 });
// 风险分级轮换要问"这台设备在该账号上最早出现在什么时候"，走这个索引。
mobileClientTokenSchema.index({ userId: 1, deviceFingerprint: 1, createdAt: 1 });

export const MobileClientTokenModel =
  (mongoose.models.MobileClientToken as mongoose.Model<MobileClientTokenDoc & { ttlExpireAt?: Date }>) ||
  mongoose.model<MobileClientTokenDoc & { ttlExpireAt?: Date }>("MobileClientToken", mobileClientTokenSchema);
