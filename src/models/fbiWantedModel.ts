import mongoose, { type Document, Schema } from "mongoose";

export interface IFBIWanted extends Document {
  name: string;
  aliases: string[];
  age: number;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  race: string;
  nationality: string;
  dateOfBirth: Date;
  placeOfBirth: string;
  charges: string[];
  description: string;
  reward: number;
  photoUrl: string;
  fingerprints: string[];
  lastKnownLocation: string;
  dangerLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  status: "ACTIVE" | "CAPTURED" | "DECEASED" | "REMOVED";
  dateAdded: Date;
  lastUpdated: Date;
  fbiNumber: string;
  ncicNumber: string;
  occupation: string;
  scarsAndMarks: string[];
  languages: string[];
  caution: string;
  remarks: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FBIWantedSchema: Schema<IFBIWanted> = new Schema<IFBIWanted>(
  {
    name: { type: String, required: true },
    aliases: [{ type: String }],
    age: { type: Number, required: true, min: 0, max: 150 },
    height: { type: String, default: "未知" },
    weight: { type: String, default: "未知" },
    eyes: { type: String, default: "未知" },
    hair: { type: String, default: "未知" },
    race: { type: String, default: "未知" },
    nationality: { type: String, default: "未知" },
    dateOfBirth: { type: Date, default: null },
    placeOfBirth: { type: String, default: "未知" },
    charges: [{ type: String, required: true }],
    description: { type: String, default: "" },
    reward: { type: Number, required: true, min: 0 },
    photoUrl: { type: String, default: "" },
    fingerprints: [{ type: String }],
    lastKnownLocation: { type: String, default: "" },
    dangerLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "EXTREME"],
      default: "MEDIUM",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CAPTURED", "DECEASED", "REMOVED"],
      default: "ACTIVE",
    },
    dateAdded: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
    fbiNumber: { type: String, unique: true, required: true },
    ncicNumber: { type: String, default: "" },
    occupation: { type: String, default: "" },
    scarsAndMarks: [{ type: String }],
    languages: [{ type: String }],
    caution: { type: String, default: "" },
    remarks: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// ===== 索引配置（优化查询性能） =====

// 单字段索引
FBIWantedSchema.index({ isActive: 1 });
FBIWantedSchema.index({ status: 1 });
FBIWantedSchema.index({ dangerLevel: 1 });
FBIWantedSchema.index({ dateAdded: -1 });

// 复合索引（优化常见查询组合）

// 1. 活跃状态 + 状态查询（最常用）
FBIWantedSchema.index(
  { isActive: 1, status: 1, dateAdded: -1 },
  {
    name: "idx_active_status_date",
  },
);

// 2. 活跃状态 + 危险等级查询
FBIWantedSchema.index(
  { isActive: 1, dangerLevel: 1, dateAdded: -1 },
  {
    name: "idx_active_danger_date",
  },
);

// 3. 状态 + 危险等级组合查询
FBIWantedSchema.index(
  { status: 1, dangerLevel: 1, dateAdded: -1 },
  {
    name: "idx_status_danger_date",
  },
);

// 4. 全面复合索引（支持多维度过滤）
FBIWantedSchema.index(
  {
    isActive: 1,
    status: 1,
    dangerLevel: 1,
    dateAdded: -1,
  },
  {
    name: "idx_active_status_danger_date",
  },
);

// 文本搜索索引（带权重优化）
FBIWantedSchema.index(
  {
    name: "text",
    description: "text",
    charges: "text",
    aliases: "text",
    fbiNumber: "text",
    ncicNumber: "text",
  },
  {
    name: "idx_text_search",
    weights: {
      name: 10, // 姓名最重要
      fbiNumber: 8, // FBI编号次之
      ncicNumber: 8, // NCIC编号
      aliases: 5, // 别名
      charges: 3, // 指控
      description: 1, // 描述最低
    },
    default_language: "english",
  },
);

// 更新 lastUpdated 字段的中间件
FBIWantedSchema.pre("save", function (this: IFBIWanted) {
  this.lastUpdated = new Date();
});

export default mongoose.models.FBIWanted || mongoose.model<IFBIWanted>("FBIWanted", FBIWantedSchema);
