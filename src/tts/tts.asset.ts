import fs from "node:fs";
import path from "node:path";
import { mongoose } from "../services/mongoService";
import logger from "../utils/logger";

interface TtsAudioAssetDocument {
  contentHash: string;
  fileName: string;
  outputFormat: string;
  mimeType: string;
  size: number;
  watermarkId?: string;
  ownerUserId?: string;
  sourceTaskId?: string;
  sourceFingerprintHash?: string;
  policyVersion?: string;
  audioData: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

const TtsAudioAssetSchema = new mongoose.Schema<TtsAudioAssetDocument>(
  {
    contentHash: { type: String, required: true, index: true },
    fileName: { type: String, required: true, unique: true, index: true },
    outputFormat: { type: String, required: true, index: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    watermarkId: { type: String, index: true },
    ownerUserId: { type: String, index: true },
    sourceTaskId: { type: String, index: true },
    sourceFingerprintHash: { type: String },
    policyVersion: { type: String },
    audioData: { type: Buffer, required: true },
  },
  {
    collection: "tts_audio_assets",
    timestamps: true,
  },
);

const TtsAudioAssetModel =
  mongoose.models.TtsAudioAsset || mongoose.model<TtsAudioAssetDocument>("TtsAudioAsset", TtsAudioAssetSchema);

export class TtsAudioAssetStore {
  private resolveMimeType(outputFormat: string) {
    switch (outputFormat) {
      case "wav":
        return "audio/wav";
      case "aac":
        return "audio/aac";
      case "flac":
        return "audio/flac";
      case "opus":
        return "audio/opus";
      case "pcm":
        return "audio/pcm";
      case "mp3":
      default:
        return "audio/mpeg";
    }
  }

  public async persistAudioAsset(params: {
    contentHash: string;
    fileName: string;
    outputFormat: string;
    buffer: Buffer;
    watermarkId?: string;
    ownerUserId?: string;
    sourceTaskId?: string;
    sourceFingerprintHash?: string;
    policyVersion?: string;
  }) {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    try {
      await TtsAudioAssetModel.findOneAndUpdate(
        { fileName: params.fileName },
        {
          $set: {
            contentHash: params.contentHash,
            fileName: params.fileName,
            outputFormat: params.outputFormat,
            mimeType: this.resolveMimeType(params.outputFormat),
            size: params.buffer.length,
            watermarkId: params.watermarkId,
            ownerUserId: params.ownerUserId,
            sourceTaskId: params.sourceTaskId,
            sourceFingerprintHash: params.sourceFingerprintHash,
            policyVersion: params.policyVersion,
            audioData: params.buffer,
          },
        },
        { upsert: true, new: true },
      ).exec();
    } catch (error) {
      logger.warn("TTS 音频写入 MongoDB 失败", { error, fileName: params.fileName });
    }
  }

  public async getAudioAssetMetadata(fileName: string) {
    if (mongoose.connection.readyState !== 1) {
      return null;
    }

    try {
      return await TtsAudioAssetModel.findOne({ fileName })
        .select("-audioData")
        .lean()
        .exec();
    } catch (error) {
      logger.warn("TTS audio metadata read failed", { error, fileName });
      return null;
    }
  }

  public async restoreAudioAssetToDisk(fileName: string, outputDir: string) {
    if (mongoose.connection.readyState !== 1) {
      return false;
    }

    try {
      const asset = await TtsAudioAssetModel.findOne({ fileName }).lean().exec();
      if (!asset?.audioData) {
        return false;
      }

      const filePath = path.join(outputDir, fileName);
      await fs.promises.mkdir(outputDir, { recursive: true });
      await fs.promises.writeFile(filePath, asset.audioData);
      return true;
    } catch (error) {
      logger.warn("TTS 音频从 MongoDB 恢复到磁盘失败", { error, fileName });
      return false;
    }
  }
}

export const ttsAudioAssetStore = new TtsAudioAssetStore();
