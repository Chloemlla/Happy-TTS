import OpenAI from "openai";
import { config } from "../config/config";
import { TtsGenerationError } from "./tts.errors";
import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";

const OPENAI_TIMEOUT_MS = 45_000;

export class OpenAiTtsProvider implements TtsProvider {
  public readonly providerId = "openai";
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    });
  }

  private async createSpeechWithTimeout(request: TtsProviderRequest) {
    const operation = this.client.audio.speech.create({
      model: request.model || config.openaiModel,
      voice: request.voice || config.openaiVoice,
      input: request.text,
      response_format: request.outputFormat as any,
      speed: request.speed || parseFloat(config.openaiSpeed),
    });

    let timeoutHandle: NodeJS.Timeout | null = null;
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new TtsGenerationError("语音生成超时，请稍后重试", 504, "TTS_UPSTREAM_TIMEOUT", true)),
          OPENAI_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    });
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
