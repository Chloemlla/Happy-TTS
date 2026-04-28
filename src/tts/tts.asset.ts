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
            audioData: params.buffer,
          },
        },
        { upsert: true, new: true },
      ).exec();
    } catch (error) {
      logger.warn("TTS 音频写入 MongoDB 失败", { error, fileName: params.fileName });
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

