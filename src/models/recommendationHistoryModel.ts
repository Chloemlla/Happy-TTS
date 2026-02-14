import mongoose, { Schema, Document } from 'mongoose';
import { VoiceStyle, GenerationRecord } from '../types/recommendation';

// 语音风格子文档Schema
const VoiceStyleSchema = new Schema<VoiceStyle>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    voice: { type: String, required: true },
    model: { type: String, required: true },
    speed: { type: Number, required: true },
    emotionalTone: { type: String, required: true },
    language: { type: String, required: true }
  },
  { _id: false }
);

// 生成记录子文档Schema
const GenerationRecordSchema = new Schema<GenerationRecord>(
  {
    id: { type: String, required: true },
    timestamp: { type: Date, required: true },
    textContent: { type: String, required: true },
    textLength: { type: Number, required: true },
    contentType: { type: String, required: true },
    language: { type: String, required: true },
    voiceStyle: { type: VoiceStyleSchema, required: true },
    duration: { type: Number, required: true }
  },
  { _id: false }
);

export interface IRecommendationHistory extends Document {
  userId: string;
  generations: GenerationRecord[];
  totalCount: number;
  lastUpdated: Date;
}

const RecommendationHistorySchema = new Schema<IRecommendationHistory>(
  {
    userId: { type: String, required: true, unique: true },
    generations: { type: [GenerationRecordSchema], default: [] },
    totalCount: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { collection: 'recommendation_history' }
);

// 索引
RecommendationHistorySchema.index({ userId: 1 }, { unique: true });
RecommendationHistorySchema.index({ lastUpdated: -1 });

export default mongoose.models.RecommendationHistory ||
  mongoose.model<IRecommendationHistory>('RecommendationHistory', RecommendationHistorySchema);
