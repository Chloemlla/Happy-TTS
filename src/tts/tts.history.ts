import { mongoose } from "../services/mongoService";
import type { GenerationHistoryStore, TtsDuplicateHit, TtsHistoryRecord } from "./tts.ports";

interface TtsHistoryDocument extends TtsHistoryRecord {
  duplicateScopeKey: string;
}

const TtsHistorySchema = new mongoose.Schema<TtsHistoryDocument>(
  {
    scope: { type: String, enum: ["user", "anonymous"], required: true, index: true },
    userId: { type: String, index: true },
    ip: { type: String, index: true },
    fingerprint: { type: String, index: true },
    text: { type: String, required: true },
    voice: { type: String, required: true },
    model: { type: String, required: true },
    outputFormat: { type: String, required: true },
    speed: { type: Number, required: true },
    contentHash: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    audioUrl: { type: String, required: true },
    provider: { type: String, required: true },
    providerModel: { type: String, required: true },
    providerVoice: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
    duplicateScopeKey: { type: String, required: true, index: true },
  },
  { collection: "tts_generation_history" },
);

TtsHistorySchema.index({ scope: 1, userId: 1, contentHash: 1, createdAt: -1 });
TtsHistorySchema.index({ scope: 1, duplicateScopeKey: 1, contentHash: 1, createdAt: -1 });

const TtsHistoryModel =
  mongoose.models.TtsGenerationHistory ||
  mongoose.model<TtsHistoryDocument>("TtsGenerationHistory", TtsHistorySchema);

export function redactTtsTextForStorage(text: string): string {
  if (/^\[redacted:\d+\]$/.test(text)) {
    return text;
  }
  return text ? `[redacted:${text.length}]` : "";
}

function mapDuplicate(record: Partial<TtsHistoryRecord> | null | undefined): TtsDuplicateHit | null {
  if (!record?.fileName || !record.audioUrl || !record.outputFormat || !record.contentHash) {
    return null;
  }

  return {
    fileName: record.fileName,
    audioUrl: record.audioUrl,
    outputFormat: record.outputFormat,
    contentHash: record.contentHash,
    provider: (record as any).provider,
    providerModel: (record as any).providerModel,
    providerVoice: (record as any).providerVoice,
  };
}

export class MongoGenerationHistoryStore implements GenerationHistoryStore {
  private buildAnonymousScopeKey(ip: string, fingerprint: string): string {
    return `${ip}::${fingerprint}`;
  }

  public async findDuplicateForUser(params: {
    userId: string;
    text: string;
    voice: string;
    model: string;
    contentHash: string;
  }) {
    const record = (await TtsHistoryModel.findOne({
      scope: "user",
      userId: params.userId,
      contentHash: params.contentHash,
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec()) as TtsHistoryRecord | null;

    return mapDuplicate(record);
  }

  public async findDuplicateForAnonymous(params: {
    ip: string;
    fingerprint: string;
    text: string;
    contentHash: string;
  }) {
    const duplicateScopeKey = this.buildAnonymousScopeKey(params.ip, params.fingerprint);
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const record = (await TtsHistoryModel.findOne({
      scope: "anonymous",
      duplicateScopeKey,
      contentHash: params.contentHash,
      createdAt: { $gte: windowStart },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec()) as TtsHistoryRecord | null;

    return mapDuplicate(record);
  }

  public async addRecord(record: TtsHistoryRecord) {
    const duplicateScopeKey =
      record.scope === "user"
        ? record.userId || ""
        : this.buildAnonymousScopeKey(record.ip || "unknown", record.fingerprint || "unknown");
    const created = await TtsHistoryModel.create({
      ...record,
      text: redactTtsTextForStorage(record.text),
      duplicateScopeKey,
    });
    return {
      ...(created.toObject() as TtsHistoryRecord),
      id: String(created._id),
    };
  }

  public async getRecentRecords(params: {
    userId?: string;
    ip?: string;
    fingerprint?: string;
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(params.limit || 10, 50));
    const query =
      params.userId && params.userId.trim()
        ? { scope: "user", userId: params.userId }
        : {
            scope: "anonymous",
            duplicateScopeKey: this.buildAnonymousScopeKey(params.ip || "unknown", params.fingerprint || "unknown"),
          };

    const records = (await TtsHistoryModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()) as TtsHistoryRecord[];

    return records.map((record: any) => ({
      ...record,
      text: redactTtsTextForStorage(record.text || ""),
      id: record._id ? String(record._id) : record.id,
    }));
  }
}

export const generationHistoryStore = new MongoGenerationHistoryStore();
