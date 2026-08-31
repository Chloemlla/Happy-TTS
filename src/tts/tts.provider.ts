import OpenAI from "openai";
import { config } from "../config/config";
import { TtsGenerationError } from "./tts.errors";
import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";

const OPENAI_TIMEOUT_MS = 45_000;

/**
 * 校验上游返回的内容确实是音频：
 * 1. content-type 必须是 audio/*（若存在）；
 * 2. buffer 非空；
 * 3. 做魔数校验，避免把 HTML/JSON 错误页当成有效音频永久缓存。
 * 校验失败抛 retryable 错误，让 TTS_MAX_RETRIES 生效而不是落盘。
 */
export function assertAudioResponse(contentTypeValue: string | null | undefined, buffer: Buffer, outputFormat: string): void {
  const contentType = String(contentTypeValue || "").toLowerCase();
  if (contentType && !contentType.startsWith("audio/")) {
    throw new TtsGenerationError("语音服务返回了非音频响应", 502, "TTS_INVALID_PROVIDER_RESPONSE", true);
  }
  if (!buffer || buffer.length === 0) {
    throw new TtsGenerationError("语音服务返回了空音频", 502, "TTS_EMPTY_PROVIDER_RESPONSE", true);
  }

  const format = String(outputFormat || "").toLowerCase();
  const prefix = buffer.subarray(0, 4).toString("latin1");
  const mp3FrameSync = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  const isPlausible =
    (format === "mp3" && (prefix.startsWith("ID3") || mp3FrameSync)) ||
    (format === "wav" && prefix.startsWith("RIFF")) ||
    (format === "opus" && prefix.startsWith("OggS")) ||
    (format === "flac" && prefix.startsWith("fLaC")) ||
    format === "aac" ||
    format === "pcm";
  if (!isPlausible) {
    throw new TtsGenerationError("语音服务返回的音频内容无法识别", 502, "TTS_INVALID_PROVIDER_RESPONSE", true);
  }
}

interface OpenAiTtsProviderOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class OpenAiTtsProvider implements TtsProvider {
  public readonly providerId = "openai";
  private client: OpenAI | null = null;

  constructor(private readonly options: OpenAiTtsProviderOptions = {}) {}

  private getClient(): OpenAI {
    if (this.client) {
      return this.client;
    }

    const apiKey = (this.options.apiKey ?? config.openaiApiKey ?? "").trim();
    if (!apiKey) {
      throw new TtsGenerationError(
        "语音服务尚未配置，请联系管理员设置 TTS 提供方密钥",
        503,
        "TTS_PROVIDER_NOT_CONFIGURED",
        false,
      );
    }

    const baseUrl = (this.options.baseUrl ?? config.openaiBaseUrl ?? "").trim();
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    return this.client;
  }

  private async createSpeechWithTimeout(request: TtsProviderRequest) {
    try {
      return await this.getClient().audio.speech.create(
        {
          model: request.model || config.openaiModel,
          voice: request.voice || config.openaiVoice,
          input: request.text,
          response_format: request.outputFormat as any,
          speed: request.speed || parseFloat(config.openaiSpeed),
        },
        { timeout: OPENAI_TIMEOUT_MS },
      );
    } catch (error) {
      const code = String((error as { code?: string }).code ?? "");
      const name = String((error as { name?: string }).name ?? "");
      const message = String((error as { message?: string }).message ?? "");
      if (code === "ETIMEDOUT" || name.includes("Timeout") || message.toLowerCase().includes("timeout")) {
        throw new TtsGenerationError("语音生成超时，请稍后重试", 504, "TTS_UPSTREAM_TIMEOUT", true);
      }
      throw error;
    }
  }

  public async synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse> {
    const model = request.model || config.openaiModel;
    const voice = request.voice || config.openaiVoice;
    const text = String(request.text || "");
    // 输入前置校验：文本非空、长度受限（与管线一致）。
    if (!text) {
      throw new TtsGenerationError("文本不能为空", 400, "TTS_EMPTY_TEXT", false);
    }
    if (text.length > 4096) {
      throw new TtsGenerationError("文本长度不能超过4096个字符", 400, "TTS_TEXT_TOO_LONG", false);
    }
    if (!model) {
      throw new TtsGenerationError("语音模型未配置", 400, "TTS_MODEL_NOT_CONFIGURED", false);
    }

    const response = await this.createSpeechWithTimeout(request);
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // 校验 content-type / 非空 / 魔数，防止坏内容进缓存。
    const rawContentType =
      typeof (response as any).headers?.get === "function"
        ? (response as any).headers.get("content-type")
        : (response as any).headers?.["content-type"];
    assertAudioResponse(rawContentType, audioBuffer, request.outputFormat);

    return {
      provider: this.providerId,
      providerModel: model,
      providerVoice: voice,
      outputFormat: request.outputFormat,
      audioBuffer,
    };
  }
}

export class AggregateTtsProvider implements TtsProvider {
  public readonly providerId = "aggregate";

  constructor(private readonly fallbackProvider: TtsProvider = new OpenAiTtsProvider()) {}

  public async synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse> {
    // 聚合提供方接入位：当前先复用现有 OpenAI 提供方，保证调用路径已收口。
    const response = await this.fallbackProvider.synthesize(request);
    return {
      ...response,
      provider: this.providerId,
      providerModel: response.providerModel,
      providerVoice: response.providerVoice,
    };
  }
}
