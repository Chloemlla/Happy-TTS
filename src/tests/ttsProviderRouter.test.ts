import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "../tts/tts.ports";
import { TtsProviderRouter } from "../tts/tts.provider-router";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import {
  EDGE_DEFAULT_BASE_URL,
  EDGE_DEFAULT_VOICE,
  EDGE_MODEL_ID,
  buildTtsProviderExecutionSnapshot,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";

function buildRuntimeConfig(provider: "openai" | "fish" | "edge"): TtsProviderRuntimeConfig {
  return {
    provider,
    defaultModel: provider === "edge" ? EDGE_MODEL_ID : provider === "fish" ? "s2.1-pro-free" : "tts-1-hd",
    fish: {
      apiKey: "fish-key",
      baseUrl: "https://api.fish.audio",
      referenceId: "reference-1",
    },
    edge: {
      baseUrl: EDGE_DEFAULT_BASE_URL,
      defaultVoice: EDGE_DEFAULT_VOICE,
      voices: [],
    },
  };
}

function buildProvider(providerId: "openai" | "fish" | "edge") {
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

  it("routes a frozen Edge snapshot to the Edge provider without re-reading the runtime config", async () => {
    jest
      .spyOn(RuntimeConfigService, "getRawTtsProviderConfig")
      .mockResolvedValue(buildRuntimeConfig("openai"));
    const openAi = buildProvider("openai");
    const fish = buildProvider("fish");
    const edge = buildProvider("edge");
    const router = new TtsProviderRouter([openAi, fish, edge]);
    const providerExecution = buildTtsProviderExecutionSnapshot(
      buildRuntimeConfig("edge"),
      { model: "tts-1-hd", voice: "en-US-AriaNeural" },
      { model: "tts-1", voice: "alloy" },
    );

    await router.synthesize({
      text: "hello",
      model: "client-model",
      voice: "client-voice",
      outputFormat: "mp3",
      speed: 1,
      providerExecution,
    });

    expect(RuntimeConfigService.getRawTtsProviderConfig).not.toHaveBeenCalled();
    expect(edge.synthesize).toHaveBeenCalledTimes(1);
    expect(edge.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        model: EDGE_MODEL_ID,
        voice: "en-US-AriaNeural",
        providerExecution: expect.objectContaining({ providerId: "edge" }),
      }),
    );
    expect(openAi.synthesize).not.toHaveBeenCalled();
    expect(fish.synthesize).not.toHaveBeenCalled();
  });
});
