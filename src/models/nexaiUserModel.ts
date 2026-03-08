/**
 * NexAI 用户数据模型
 * 与原系统完全隔离，使用独立集合 nexai_users
 */
import { mongoose } from "../services/mongoService";

const nexaiUserSchema = new mongoose.Schema(
  {
    // 唯一标识
    id: { type: String, required: true, unique: true, index: true },

    // 基本信息
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String }, // bcrypt 哈希，Google/GitHub 专属用户可为空
    displayName: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },

    // Google OAuth
    googleId: { type: String, sparse: true, unique: true },
    googleEmail: { type: String },
    googleAvatarUrl: { type: String },

    // GitHub OAuth
    githubId: { type: String, sparse: true, unique: true },
    githubUsername: { type: String },
    githubEmail: { type: String },
    githubAvatarUrl: { type: String },

    // 鉴权信息
    authProvider: {
      type: String,
      enum: ["local", "google", "github", "google+github", "local+google", "local+github", "all"],
      default: "local",
    },
    emailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // Token 管理
    refreshToken: { type: String }, // 哈希后存储
    refreshTokenExpiresAt: { type: Number },

    // 登录记录
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    loginCount: { type: Number, default: 0 },

    // WebAuthn (Passkeys)
    passkeys: [
      {
        id: { type: String, required: true }, // Credential ID (base64url)
        publicKey: { type: Buffer, required: true },
        counter: { type: Number, required: true },
        backedUp: { type: Boolean, required: true, default: false },
        transports: { type: [String], default: [] },
        deviceType: { type: String, required: true, default: "singleDevice" },
      }
    ],
    currentChallenge: { type: String },
  },
  {
    collection: "nexai_users", // 独立集合，与原系统隔离
    timestamps: true, // 自动添加 createdAt 和 updatedAt
  },
);

// 索引优化
nexaiUserSchema.index({ googleId: 1 }, { sparse: true });
nexaiUserSchema.index({ githubId: 1 }, { sparse: true });
nexaiUserSchema.index({ email: 1, authProvider: 1 });

export const NexaiUserModel =
  mongoose.models.NexaiUser || mongoose.model("NexaiUser", nexaiUserSchema);

// 类型定义
export interface INexaiUser {
  id: string;
  username: string;
  email: string;
  password?: string;
  displayName: string;
  avatarUrl?: string;
  googleId?: string;
  googleEmail?: string;
  googleAvatarUrl?: string;
  githubId?: string;
  githubUsername?: string;
  githubEmail?: string;
  githubAvatarUrl?: string;
  authProvider: string;
  emailVerified: boolean;
  role: "user" | "admin";
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  loginCount: number;
  passkeys?: {
    id: string;
    publicKey: Buffer;
    counter: number;
    backedUp: boolean;
    transports: string[];
    deviceType: string;
  }[];
  currentChallenge?: string;
  createdAt: Date;
  updatedAt: Date;
}
