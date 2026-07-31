import OpenAI from "openai";
import { config } from "../config/config";
import { TtsGenerationError } from "./tts.errors";
import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";

const OPENAI_TIMEOUT_MS = 45_000;

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
    const response = await this.createSpeechWithTimeout(request);
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      provider: this.providerId,
      providerModel: request.model || config.openaiModel,
      providerVoice: request.voice || config.openaiVoice,
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
