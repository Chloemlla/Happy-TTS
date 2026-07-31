import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "../tts/tts.ports";
import { TtsProviderRouter } from "../tts/tts.provider-router";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import type { TtsProviderRuntimeConfig } from "../config/ttsProviderConfig";

function buildRuntimeConfig(provider: "openai" | "fish"): TtsProviderRuntimeConfig {
  return {
    provider,
    defaultModel: provider === "fish" ? "s2.1-pro-free" : "tts-1-hd",
    fish: {
      apiKey: "fish-key",
      baseUrl: "https://api.fish.audio",
      referenceId: "reference-1",
    },
  };
}

function buildProvider(providerId: "openai" | "fish") {
  const synthesize = jest.fn(async (request: TtsProviderRequest): Promise<TtsProviderResponse> => ({
    provider: providerId,
    providerModel: request.model,
    providerVoice: request.voice,
    outputFormat: request.outputFormat,
    audioBuffer: Buffer.from(providerId),
  }));
  return { providerId, synthesize } as TtsProvider & { synthesize: jest.Mock };
}

describe("TtsProviderRouter runtime switching", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads the active provider for each synthesis request", async () => {
    jest
      .spyOn(RuntimeConfigService, "getRawTtsProviderConfig")
      .mockResolvedValueOnce(buildRuntimeConfig("openai"))
      .mockResolvedValueOnce(buildRuntimeConfig("fish"));
    const openAi = buildProvider("openai");
    const fish = buildProvider("fish");
    const router = new TtsProviderRouter([openAi, fish]);
    const request = {
      text: "hello",
      model: "client-model",
      voice: "client-voice",
      outputFormat: "mp3",
      speed: 1,
    };

    await router.synthesize(request);
    await router.synthesize(request);

    expect(openAi.synthesize).toHaveBeenCalledTimes(1);
    expect(openAi.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ model: "tts-1-hd", voice: "alloy" }),
    );
    expect(fish.synthesize).toHaveBeenCalledTimes(1);
    expect(fish.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "s2.1-pro-free",
        voice: "configured_reference",
        providerExecution: expect.objectContaining({ providerId: "fish", referenceId: "reference-1" }),
      }),
    );
  });
});
