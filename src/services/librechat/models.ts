import { mongoose } from "../mongoService";

export interface ChatProviderDoc {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled?: boolean;
  weight?: number;
  group?: string;
  updatedAt?: Date;
}

const ImageRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    imageUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "librechat_images" },
);

export const ImageRecordModel =
  mongoose.models.LibreChatImage || mongoose.model("LibreChatImage", ImageRecordSchema);

const LatestRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "latest" },
    updateTime: { type: String, required: true },
    updateTimeShanghai: { type: String },
    imageUrl: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "librechat_latest" },
);

export const LatestRecordModel =
  mongoose.models.LibreChatLatest || mongoose.model("LibreChatLatest", LatestRecordSchema);

export const ChatHistorySchema = new mongoose.Schema(
  {
    ownerKey: { type: String },
    userId: { type: String },
    messages: { type: Array, required: true, default: [] },
    updatedAt: { type: Date, default: Date.now },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { collection: "librechat_histories" },
);

export const LIBRECHAT_OWNER_INDEX = {
  fields: { ownerKey: 1 } as const,
  options: { unique: true, sparse: true, name: "librechat_owner_unique" } as const,
};

ChatHistorySchema.index(LIBRECHAT_OWNER_INDEX.fields, LIBRECHAT_OWNER_INDEX.options);
ChatHistorySchema.index({ updatedAt: -1 });

export const ChatHistoryModel: any =
  mongoose.models.LibreChatHistory || mongoose.model("LibreChatHistory", ChatHistorySchema);

const ChatProviderSchema = new mongoose.Schema(
  {
    baseUrl: { type: String, required: true },
    apiKey: { type: String, required: true },
    model: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    weight: { type: Number, default: 1 },
    group: { type: String, default: "" },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "chat_providers" },
);

export const ChatProviderModel =
  (mongoose.models.ChatProvider as any) || mongoose.model("ChatProvider", ChatProviderSchema);
