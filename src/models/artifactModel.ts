import mongoose, { type Document, Schema, Types } from "mongoose";

// ========== Artifact 主表 ==========
export interface IArtifact extends Document {
  _id: Types.ObjectId;
  shortId: string;
  userId: string;

  // 内容信息
  title: string;
  contentType: string; // html, code, markdown, mermaid, etc.
  language?: string;
  content: string; // 直接存储内容
  contentHash: string; // SHA-256 哈希

  // 访问控制
  visibility: "public" | "private" | "password";
  passwordHash?: string;

  // 元数据
  description?: string;
  tags: string[];

  // 统计
  viewCount: number;
  lastViewedAt?: Date;

  // 时间管理
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ArtifactSchema: Schema<IArtifact> = new Schema<IArtifact>(
  {
    shortId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },

    title: { type: String, required: true },
    contentType: { type: String, required: true },
    language: { type: String },
    content: { type: String, required: true },
    contentHash: { type: String, required: true, index: true },

    visibility: {
      type: String,
      required: true,
      enum: ["public", "private", "password"],
      default: "private"
    },
    passwordHash: { type: String },

    description: { type: String },
    tags: { type: [String], default: [] },

    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },

    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

// 索引优化
ArtifactSchema.index({ shortId: 1 });
ArtifactSchema.index({ userId: 1, createdAt: -1 });
ArtifactSchema.index({ contentHash: 1 });
ArtifactSchema.index({ expiresAt: 1 }, { sparse: true });
ArtifactSchema.index({ visibility: 1, createdAt: -1 });

export const ArtifactModel = mongoose.models.Artifact || mongoose.model<IArtifact>("Artifact", ArtifactSchema);

// ========== Artifact 版本表 ==========
export interface IArtifactVersion extends Document {
  artifactId: string;
  versionNumber: number;
  content: string;
  contentHash: string;
  createdAt: Date;
}

const ArtifactVersionSchema: Schema<IArtifactVersion> = new Schema<IArtifactVersion>(
  {
    artifactId: { type: String, required: true, index: true },
    versionNumber: { type: Number, required: true },
    content: { type: String, required: true },
    contentHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ArtifactVersionSchema.index({ artifactId: 1, versionNumber: 1 }, { unique: true });

export const ArtifactVersionModel = mongoose.models.ArtifactVersion ||
  mongoose.model<IArtifactVersion>("ArtifactVersion", ArtifactVersionSchema);

// ========== Artifact 访问日志表 ==========
export interface IArtifactView extends Document {
  artifactId: string;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  countryCode?: string;
  viewedAt: Date;
}

const ArtifactViewSchema: Schema<IArtifactView> = new Schema<IArtifactView>(
  {
    artifactId: { type: String, required: true, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    referer: { type: String },
    countryCode: { type: String },
  },
  { timestamps: { createdAt: "viewedAt", updatedAt: false } }
);

ArtifactViewSchema.index({ artifactId: 1, viewedAt: -1 });

export const ArtifactViewModel = mongoose.models.ArtifactView ||
  mongoose.model<IArtifactView>("ArtifactView", ArtifactViewSchema);
