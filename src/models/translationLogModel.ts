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
    timestamp: { type: Date, default: Date.now, index: true },
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

export const TranslationLogModel =
  (mongoose.models.TranslationLog as mongoose.Model<ITranslationLog>) ||
  mongoose.model<ITranslationLog>("TranslationLog", TranslationLogSchema);
