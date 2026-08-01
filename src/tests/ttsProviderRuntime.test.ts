import {
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_DEFAULT_MODEL,
  buildTtsProviderExecutionSnapshot,
  buildTtsProviderPublicConfig,
  mergeTtsProviderAdminUpdate,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";
import { TtsService } from "../tts/tts.service";

const baseConfig: TtsProviderRuntimeConfig = {
  provider: "openai",
  defaultModel: "tts-1-hd",
  fish: {
    apiKey: "stored-fish-key",
    baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
    referenceId: "reference-a",
  },
};

describe("TTS provider runtime capability", () => {
  it("preserves a stored Fish key when the administrator submits an empty key", () => {
    const next = mergeTtsProviderAdminUpdate(baseConfig, {
      provider: "fish",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
      fish: {
        apiKey: "",
        baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
        referenceId: "reference-b",
      },
    });

    expect(next.fish.apiKey).toBe("stored-fish-key");
    expect(next.fish.referenceId).toBe("reference-b");
  });

  it("repairs a known OpenAI model when switching directly to Fish", () => {
    const next = mergeTtsProviderAdminUpdate(baseConfig, {
      provider: "fish",
      defaultModel: "tts-1-hd",
      fish: { apiKey: "" },
    });

    expect(next.defaultModel).toBe(FISH_AUDIO_DEFAULT_MODEL);
  });

  it("repairs the Fish default model when switching directly back to OpenAI", () => {
    const fishConfig: TtsProviderRuntimeConfig = {
      ...baseConfig,
      provider: "fish",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
    };
    const next = mergeTtsProviderAdminUpdate(fishConfig, {
      provider: "openai",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
      fish: { apiKey: "" },
    });

    expect(next.defaultModel).toBe("tts-1");
  });

  it("rejects model values that are unsafe for the Fish model header", () => {
    expect(() =>
      mergeTtsProviderAdminUpdate(baseConfig, {
        provider: "fish",
        defaultModel: "s2.1-pro-free\r\nx-injected: true",
        fish: { apiKey: "" },
      }),
    ).toThrow("TTS 默认模型格式无效");
  });

  it("normalizes ordinary client model and voice values to the active capability", () => {
    const fishExecution = buildTtsProviderExecutionSnapshot(
      { ...baseConfig, provider: "fish", defaultModel: "future-fish-model" },
      { model: "tts-1", voice: "nova" },
      { model: "tts-1", voice: "alloy" },
    );
    expect(fishExecution).toMatchObject({
      providerId: "fish",
      model: "future-fish-model",
      voice: "configured_reference",
      referenceId: "reference-a",
      cacheIdentity:
        "fish|future-fish-model|configured_reference|reference-a|https://api.fish.audio",
    });

    const openAiExecution = buildTtsProviderExecutionSnapshot(
      baseConfig,
      { model: "unapproved-model", voice: "unapproved-voice" },
      { model: "tts-1", voice: "alloy", baseUrl: "https://api.openai.com/v1" },
    );
    expect(openAiExecution).toMatchObject({
      providerId: "openai",
      model: "tts-1-hd",
      voice: "alloy",
    });

    const staleOpenAiExecution = buildTtsProviderExecutionSnapshot(
      { ...baseConfig, defaultModel: FISH_AUDIO_DEFAULT_MODEL },
      { model: FISH_AUDIO_DEFAULT_MODEL, voice: "alloy" },
      { model: "tts-1-hd", voice: "alloy", baseUrl: "https://api.openai.com/v1" },
    );
    expect(staleOpenAiExecution.model).toBe("tts-1-hd");
  });

  it("does not expose the Fish API key in public capability output", () => {
    const publicConfig = buildTtsProviderPublicConfig(
      { ...baseConfig, provider: "fish", defaultModel: FISH_AUDIO_DEFAULT_MODEL },
      { model: "tts-1", voice: "alloy" },
    );

    expect(publicConfig).toMatchObject({
      provider: "fish",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
      voiceMode: "configured_reference",
    });
    expect(JSON.stringify(publicConfig)).not.toContain("stored-fish-key");
  });

  it("isolates provider, reference, OpenAI speed, and format while fixing Fish speed at 1x", () => {
    const service = Object.create(TtsService.prototype) as TtsService;
    const openAiExecution = buildTtsProviderExecutionSnapshot(
      baseConfig,
      { model: "tts-1-hd", voice: "nova" },
      { model: "tts-1", voice: "alloy", baseUrl: "https://api.openai.com/v1" },
    );
    const fishExecutionA = buildTtsProviderExecutionSnapshot(
      { ...baseConfig, provider: "fish", defaultModel: FISH_AUDIO_DEFAULT_MODEL },
      {},
      { model: "tts-1", voice: "alloy" },
    );
    const fishExecutionB = buildTtsProviderExecutionSnapshot(
      {
        ...baseConfig,
        provider: "fish",
        defaultModel: FISH_AUDIO_DEFAULT_MODEL,
        fish: { ...baseConfig.fish, referenceId: "reference-b" },
      },
      {},
      { model: "tts-1", voice: "alloy" },
    );

    const openAiIdentity = {
      text: "hello",
      voice: "nova",
      model: "tts-1-hd",
      speed: 1,
      outputFormat: "mp3",
      providerExecution: openAiExecution,
    };
    const fishIdentityA = {
      text: "hello",
      voice: fishExecutionA.voice,
      model: fishExecutionA.model,
      speed: 1,
      outputFormat: "mp3",
      providerExecution: fishExecutionA,
    };
    const openAiHash = service.generateContentHash(openAiIdentity);
    const openAiFastHash = service.generateContentHash({ ...openAiIdentity, speed: 1.5 });
    const openAiFlacHash = service.generateContentHash({ ...openAiIdentity, outputFormat: "flac" });
    const fishFastHash = service.generateContentHash({ ...fishIdentityA, speed: 2 });
    const fishHashA = service.generateContentHash(fishIdentityA);
    const fishHashB = service.generateContentHash({
      ...fishIdentityA,
      voice: fishExecutionB.voice,
      model: fishExecutionB.model,
      providerExecution: fishExecutionB,
    });

    expect(openAiHash).not.toBe(fishHashA);
    expect(fishHashA).not.toBe(fishHashB);
    expect(fishHashA).toBe(fishFastHash);
    expect(openAiHash).not.toBe(openAiFastHash);
    expect(openAiHash).not.toBe(openAiFlacHash);
  });

  it("keeps the previous hash as a secondary compatibility candidate", () => {
    const service = Object.create(TtsService.prototype) as TtsService;
    const execution = buildTtsProviderExecutionSnapshot(
      baseConfig,
      { model: "tts-1-hd", voice: "nova" },
      { model: "tts-1", voice: "alloy", baseUrl: "https://api.openai.com/v1" },
    );
    const identity = {
      text: "legacy-compatible",
      voice: execution.voice,
      model: execution.model,
      speed: 1.25,
      outputFormat: "flac",
      providerExecution: execution,
    };

    const candidates = service.generateContentHashCandidates(identity);

    expect(candidates).toEqual([
      service.generateContentHash(identity),
      service.generateLegacyContentHash(identity),
    ]);
    expect(candidates[0]).not.toBe(candidates[1]);
  });
});
