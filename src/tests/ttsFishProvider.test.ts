import {
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_DEFAULT_MODEL,
  type TtsProviderExecutionSnapshot,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";
import { FishAudioTtsProvider } from "../tts/tts.fish-provider";

function buildConfig(apiKey = "fish-secret"): TtsProviderRuntimeConfig {
  return {
    provider: "fish",
    defaultModel: FISH_AUDIO_DEFAULT_MODEL,
    fish: {
      apiKey,
      baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
      referenceId: "reference-123",
    },
  };
}

function buildExecution(referenceId = "reference-123"): TtsProviderExecutionSnapshot {
  return {
    providerId: "fish",
    model: FISH_AUDIO_DEFAULT_MODEL,
    voice: referenceId ? "configured_reference" : "provider_default",
    ...(referenceId ? { referenceId } : {}),
    baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
    cacheIdentity: `fish|${FISH_AUDIO_DEFAULT_MODEL}|${referenceId || "default"}`,
  };
}

describe("FishAudioTtsProvider", () => {
  it("uses the Fish JSON, Bearer and model-header contract", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    const provider = new FishAudioTtsProvider(
      async () => buildConfig(),
      fetchMock as unknown as typeof fetch,
    );

    const response = await provider.synthesize({
      text: "hello",
      model: "ignored-client-model",
      voice: "ignored-client-voice",
      outputFormat: "mp3",
      speed: 1,
      providerExecution: buildExecution(),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fish.audio/v1/tts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fish-secret",
          "Content-Type": "application/json",
          model: FISH_AUDIO_DEFAULT_MODEL,
        }),
        body: JSON.stringify({
          text: "hello",
          format: "mp3",
          reference_id: "reference-123",
        }),
      }),
    );
    expect(response).toMatchObject({
      provider: "fish",
      providerModel: FISH_AUDIO_DEFAULT_MODEL,
      providerVoice: "configured_reference",
      outputFormat: "mp3",
    });
    expect(response.audioBuffer).toEqual(Buffer.from([1, 2, 3]));
  });

  it("fails at request time when the API key is absent", async () => {
    const fetchMock = jest.fn();
    const provider = new FishAudioTtsProvider(
      async () => buildConfig(""),
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      provider.synthesize({
        text: "hello",
        model: FISH_AUDIO_DEFAULT_MODEL,
        voice: "provider_default",
        outputFormat: "mp3",
        speed: 1,
        providerExecution: buildExecution(""),
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "TTS_PROVIDER_NOT_CONFIGURED",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-MP3 output before calling Fish Audio", async () => {
    const fetchMock = jest.fn();
    const provider = new FishAudioTtsProvider(
      async () => buildConfig(),
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      provider.synthesize({
        text: "hello",
        model: FISH_AUDIO_DEFAULT_MODEL,
        voice: "provider_default",
        outputFormat: "aac",
        speed: 1,
        providerExecution: buildExecution(""),
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "TTS_OUTPUT_FORMAT_UNSUPPORTED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a successful JSON response instead of persisting it as MP3", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      arrayBuffer: async () => Buffer.from('{"error":"unexpected"}').buffer,
    });
    const provider = new FishAudioTtsProvider(
      async () => buildConfig(),
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      provider.synthesize({
        text: "hello",
        model: FISH_AUDIO_DEFAULT_MODEL,
        voice: "configured_reference",
        outputFormat: "mp3",
        speed: 1,
        providerExecution: buildExecution(),
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "TTS_INVALID_PROVIDER_RESPONSE",
    });
  });
});
