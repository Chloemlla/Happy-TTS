import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";
import { AggregateTtsProvider, OpenAiTtsProvider } from "./tts.provider";

export class TtsProviderRouter {
  constructor(private readonly providers: TtsProvider[] = [new AggregateTtsProvider(), new OpenAiTtsProvider()]) {}

  public getPrimaryProvider(): TtsProvider {
    const preferredProviderId = process.env.TTS_PROVIDER?.trim().toLowerCase();
    if (preferredProviderId) {
      const matched = this.providers.find((provider) => provider.providerId.toLowerCase() === preferredProviderId);
      if (matched) {
        return matched;
      }
    }
    return this.providers[0];
  }

  public async synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse> {
    const provider = this.getPrimaryProvider();
    return provider.synthesize(request);
  }
}

export const ttsProviderRouter = new TtsProviderRouter();
