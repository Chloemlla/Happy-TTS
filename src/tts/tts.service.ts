import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { config } from "../config/config";
import logger from "../utils/logger";

dotenv.config();

type OutputFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface TtsRequest {
  text: string;
  model: string;
  voice: string;
  outputFormat: string;
  speed: number;
  userId?: string;
  isAdmin?: boolean;
}

interface UserViolation {
  count: number;
  lastViolation: number;
}

export class TtsService {
  private openai: OpenAI;
  private readonly outputDir: string;
  private readonly baseUrl: string;
  private readonly userViolations: Map<string, UserViolation>;
  private readonly violationThreshold = 3;
  private readonly violationWindow = 24 * 60 * 60 * 1000;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.outputDir = config.audioDir;
    this.baseUrl = config.baseUrl;
    this.userViolations = new Map();
    this.ensureOutputDir();
  }

  private ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public generateContentHash(text: string, voice: string, model: string): string {
    return crypto.createHash("md5").update(`${text}-${voice}-${model}`).digest("hex");
  }

  public resolveOutputFormat(format: string): OutputFormat {
    const validFormats: OutputFormat[] = ["mp3", "opus", "aac", "flac", "wav", "pcm"];
    return validFormats.includes(format as OutputFormat) ? (format as OutputFormat) : "mp3";
  }

  public buildAudioUrl(fileName: string) {
    return `${this.baseUrl}/static/audio/${fileName}`;
  }

  private validateFileName(fileName: string): string {
    const sanitized = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
    return path.basename(sanitized);
  }

  private checkUserViolation(userId: string): boolean {
    const violation = this.userViolations.get(userId);
    if (!violation) {
      return false;
    }

    const now = Date.now();
    if (now - violation.lastViolation > this.violationWindow) {
      this.userViolations.delete(userId);
      return false;
    }

    return violation.count >= this.violationThreshold;
  }

  private recordViolation(userId: string) {
    const now = Date.now();
    const violation = this.userViolations.get(userId) || { count: 0, lastViolation: now };

    if (now - violation.lastViolation > this.violationWindow) {
      violation.count = 1;
    } else {
      violation.count += 1;
    }

    violation.lastViolation = now;
    this.userViolations.set(userId, violation);
  }

  public findExistingFile(contentHash: string, outputFormat: string): string | null {
    const safeOutputFormat = this.resolveOutputFormat(outputFormat);
    const safeContentHash = /^[a-f0-9]{32}$/i.test(contentHash) ? contentHash : "";

    if (!safeContentHash) {
      return null;
    }

    const fileName = `${safeContentHash}.${safeOutputFormat}`;
    const safeFileName = this.validateFileName(fileName);
    const filePath = path.join(this.outputDir, safeFileName);
    return fs.existsSync(filePath) ? safeFileName : null;
  }

  public async generateSpeech(request: TtsRequest) {
    try {
      const { text, model, voice, outputFormat, speed, userId, isAdmin } = request;

      if (!text) {
        throw new Error("文本不能为空");
      }

      if (userId && !isAdmin && this.checkUserViolation(userId)) {
        throw new Error("由于重复提交相同内容，您的账号已被临时封禁24小时");
      }

      const contentHash = this.generateContentHash(text, voice, model);
      const safeOutputFormat = this.resolveOutputFormat(outputFormat);
      const existingFile = this.findExistingFile(contentHash, safeOutputFormat);

      if (existingFile) {
        if (userId && !isAdmin) {
          this.recordViolation(userId);
        }

        return {
          fileName: existingFile,
          audioUrl: this.buildAudioUrl(existingFile),
          isDuplicate: true,
          outputFormat: safeOutputFormat,
        };
      }

      const response = await this.openai.audio.speech.create({
        model: model || config.openaiModel,
        voice: voice || config.openaiVoice,
        input: text,
        response_format: safeOutputFormat,
        speed: speed || parseFloat(config.openaiSpeed),
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = `${contentHash}.${safeOutputFormat}`;
      const safeFileName = this.validateFileName(fileName);
      const filePath = path.join(this.outputDir, safeFileName);

      await fs.promises.writeFile(filePath, buffer);

      return {
        fileName: safeFileName,
        audioUrl: this.buildAudioUrl(safeFileName),
        isDuplicate: false,
        outputFormat: safeOutputFormat,
      };
    } catch (error) {
      logger.error("生成语音失败:", error);
      throw error;
    }
  }
}
