import { mongoose } from "../services/mongoService";
import type {
  GenerationHistoryStore,
  TtsDuplicateHit,
  TtsHistoryRecord,
  TtsHistoryReviewStatus,
} from "./tts.ports";

interface TtsHistoryDocument extends TtsHistoryRecord {
  duplicateScopeKey: string;
}

const REVIEW_STATUSES: TtsHistoryReviewStatus[] = ["none", "needs_review", "in_review", "fixed", "dismissed"];

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
    audioFileId: { type: String, index: true },
    audioStorage: { type: String, enum: ["file", "mongo"] },
    audioMimeType: { type: String },
    audioSize: { type: Number },
    provider: { type: String, required: true },
    providerModel: { type: String, required: true },
    providerVoice: { type: String, required: true },
    createdAt: { type: String, required: true, index: true },
    adminNote: { type: String },
    adminSuggestion: { type: String },
    reviewStatus: { type: String, enum: REVIEW_STATUSES, default: "none", index: true },
    reviewedBy: { type: String },
    reviewedAt: { type: String },
    fixedAt: { type: String },
    updatedAt: { type: String },
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
  return String(text || "");
}

function normalizeReviewStatus(value: unknown): TtsHistoryReviewStatus {
  return REVIEW_STATUSES.includes(value as TtsHistoryReviewStatus) ? (value as TtsHistoryReviewStatus) : "none";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimOptionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return String(value || "").trim().slice(0, maxLength);
}

function mapHistoryRecord(record: any): TtsHistoryRecord {
  const { _id, __v, duplicateScopeKey, ...rest } = record || {};
  return {
    ...rest,
    id: _id ? String(_id) : rest.id,
    text: String(rest.text || ""),
    reviewStatus: normalizeReviewStatus(rest.reviewStatus),
  };
}

function mapDuplicate(record: Partial<TtsHistoryRecord> | null | undefined): TtsDuplicateHit | null {
  if (!record?.fileName || !record.audioUrl || !record.outputFormat || !record.contentHash) {
    return null;
  }

  return {
    fileName: record.fileName,
    audioUrl: record.audioUrl,
    audioFileId: record.audioFileId,
    audioStorage: record.audioStorage,
    audioMimeType: record.audioMimeType,
    audioSize: record.audioSize,
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
      reviewStatus: record.reviewStatus || "none",
      updatedAt: record.updatedAt || record.createdAt,
      duplicateScopeKey,
    });
    return mapHistoryRecord(created.toObject());
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

    return records.map(mapHistoryRecord);
  }

  public async getAllRecords(params: {
    page?: number;
    limit?: number;
    userId?: string;
    scope?: "user" | "anonymous";
    reviewStatus?: TtsHistoryReviewStatus | "all";
    q?: string;
  }) {
    const page = Math.max(1, Math.floor(params.page || 1));
    const limit = Math.max(1, Math.min(params.limit || 20, 100));
    const query: Record<string, any> = {};
    const and: Record<string, any>[] = [];

    if (params.userId?.trim()) {
      query.userId = params.userId.trim();
    }

    if (params.scope === "user" || params.scope === "anonymous") {
      query.scope = params.scope;
    }

    if (params.reviewStatus && params.reviewStatus !== "all") {
      if (params.reviewStatus === "none") {
        and.push({
          $or: [{ reviewStatus: "none" }, { reviewStatus: { $exists: false } }, { reviewStatus: null }],
        });
      } else {
        query.reviewStatus = params.reviewStatus;
      }
    }

    const q = params.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegExp(q), "i");
      and.push({
        $or: [
          { userId: pattern },
          { text: pattern },
          { fileName: pattern },
          { audioFileId: pattern },
          { audioMimeType: pattern },
          { contentHash: pattern },
          { voice: pattern },
          { model: pattern },
          { outputFormat: pattern },
          { provider: pattern },
          { providerModel: pattern },
          { providerVoice: pattern },
        ],
      });
    }

    if (and.length) {
      query.$and = and;
    }

    const [records, total] = await Promise.all([
      TtsHistoryModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      TtsHistoryModel.countDocuments(query).exec(),
    ]);

    return {
      records: (records as TtsHistoryRecord[]).map(mapHistoryRecord),
      total,
      page,
      limit,
    };
  }

  public async updateAdminReview(
    recordId: string,
    patch: {
      adminNote?: string;
      adminSuggestion?: string;
      reviewStatus?: TtsHistoryReviewStatus;
      reviewedBy?: string;
    },
  ) {
    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return null;
    }

    const now = new Date().toISOString();
    const setPatch: Record<string, unknown> = {
      updatedAt: now,
    };
    const unsetPatch: Record<string, string> = {};

    if (patch.adminNote !== undefined) {
      setPatch.adminNote = trimOptionalText(patch.adminNote, 1000);
    }

    if (patch.adminSuggestion !== undefined) {
      setPatch.adminSuggestion = trimOptionalText(patch.adminSuggestion, 1000);
    }

    if (patch.reviewStatus !== undefined) {
      setPatch.reviewStatus = normalizeReviewStatus(patch.reviewStatus);
      setPatch.reviewedAt = now;
      setPatch.reviewedBy = trimOptionalText(patch.reviewedBy, 120);

      if (setPatch.reviewStatus === "fixed") {
        setPatch.fixedAt = now;
      } else {
        unsetPatch.fixedAt = "";
      }
    }

    const update: Record<string, unknown> = { $set: setPatch };
    if (Object.keys(unsetPatch).length) {
      update.$unset = unsetPatch;
    }

    const updated = await TtsHistoryModel.findByIdAndUpdate(recordId, update, { returnDocument: "after" })
      .lean()
      .exec();

    return updated ? mapHistoryRecord(updated) : null;
  }
}

export const generationHistoryStore = new MongoGenerationHistoryStore();
