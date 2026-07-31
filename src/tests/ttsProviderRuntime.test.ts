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

  it("isolates cache hashes by provider and Fish reference", () => {
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

    const openAiHash = service.generateContentHash("hello", "nova", "tts-1-hd", openAiExecution);
    const fishHashA = service.generateContentHash("hello", fishExecutionA.voice, fishExecutionA.model, fishExecutionA);
    const fishHashB = service.generateContentHash("hello", fishExecutionB.voice, fishExecutionB.model, fishExecutionB);

    expect(openAiHash).not.toBe(fishHashA);
    expect(fishHashA).not.toBe(fishHashB);
  });
});
