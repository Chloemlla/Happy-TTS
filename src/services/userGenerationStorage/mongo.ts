import { mongoose } from "../mongoService";
import { type GenerationRecord, isAdminUser as sharedIsAdminUser } from "./types";

const generationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    text: { type: String, required: true },
    voice: { type: String },
    model: { type: String },
    outputFormat: { type: String },
    speed: { type: Number },
    fileName: { type: String },
    contentHash: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { collection: "user_generations" },
);

const GenerationModel = mongoose.models.UserGeneration || mongoose.model("UserGeneration", generationSchema);

function sanitizeString(str: unknown): string {
  if (typeof str !== "string") return "";
  if (/[$.{}[\]]/.test(str)) return "";
  return str;
}

export async function findDuplicateGeneration({
  userId,
  text,
  voice,
  model,
  contentHash,
}: GenerationRecord): Promise<GenerationRecord | null> {
  const safeUserId = sanitizeString(userId);
  const safeText = sanitizeString(text);
  const safeVoice = sanitizeString(voice);
  const safeModel = sanitizeString(model);
  const safeContentHash = sanitizeString(contentHash);
  const query = safeContentHash
    ? { userId: safeUserId, contentHash: safeContentHash }
    : { userId: safeUserId, text: safeText, voice: safeVoice, model: safeModel };
  return (await GenerationModel.findOne(query).lean()) as GenerationRecord | null;
}

export async function addGenerationRecord(record: GenerationRecord): Promise<GenerationRecord> {
  const safeRecord = {
    ...record,
    userId: sanitizeString(record.userId),
    text: sanitizeString(record.text),
    voice: sanitizeString(record.voice),
    model: sanitizeString(record.model),
    contentHash: sanitizeString(record.contentHash),
  };
  const created = await GenerationModel.create(safeRecord);
  return typeof created.toObject === "function" ? (created.toObject() as GenerationRecord) : safeRecord;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  return sharedIsAdminUser(userId);
}
