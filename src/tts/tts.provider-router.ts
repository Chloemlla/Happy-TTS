import { config } from "../config/config";
import {
  buildTtsProviderExecutionSnapshot,
  type TtsProviderExecutionSnapshot,
} from "../config/ttsProviderConfig";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import { TtsGenerationError } from "./tts.errors";
import { FishAudioTtsProvider } from "./tts.fish-provider";
import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";
import { OpenAiTtsProvider } from "./tts.provider";

export class TtsProviderRouter {
  private readonly providers: Map<string, TtsProvider>;

  constructor(providers: TtsProvider[] = [new OpenAiTtsProvider(), new FishAudioTtsProvider()]) {
    this.providers = new Map<string, TtsProvider>(
      providers.map((provider) => [provider.providerId, provider] as const),
    );
  }

  public async resolveExecutionSnapshot(
    requestedModel?: string,
    requestedVoice?: string,
    frozenSnapshot?: TtsProviderExecutionSnapshot,
  ): Promise<TtsProviderExecutionSnapshot> {
    if (frozenSnapshot && (frozenSnapshot.providerId === "openai" || frozenSnapshot.providerId === "fish")) {
      return frozenSnapshot;
    }

    const runtimeConfig = await RuntimeConfigService.getRawTtsProviderConfig();
    return buildTtsProviderExecutionSnapshot(
      runtimeConfig,
      { model: requestedModel, voice: requestedVoice },
      {
        model: config.openaiModel,
        voice: config.openaiVoice,
        baseUrl: config.openaiBaseUrl,
      },
    );
  }

  public async getPrimaryProvider(): Promise<TtsProvider> {
    const execution = await this.resolveExecutionSnapshot();
    const provider = this.providers.get(execution.providerId);
    if (!provider) {
      throw new TtsGenerationError("TTS 提供方不可用", 503, "TTS_PROVIDER_UNAVAILABLE", false);
    }
    return provider;
  }

  public async synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse> {
    const execution = await this.resolveExecutionSnapshot(
      request.model,
      request.voice,
      request.providerExecution,
    );
    const provider = this.providers.get(execution.providerId);
    if (!provider) {
      throw new TtsGenerationError("TTS 提供方不可用", 503, "TTS_PROVIDER_UNAVAILABLE", false);
    }

    return provider.synthesize({
      ...request,
      model: execution.model,
      voice: execution.voice,
      providerExecution: execution,
    });
  }
}

export const ttsProviderRouter = new TtsProviderRouter();
