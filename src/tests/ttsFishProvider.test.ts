import {
  EDGE_DEFAULT_BASE_URL,
  EDGE_DEFAULT_VOICE,
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
    edge: {
      baseUrl: EDGE_DEFAULT_BASE_URL,
      defaultVoice: EDGE_DEFAULT_VOICE,
      voices: [],
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
    // assertAudioResponse 会做魔数校验（tts.provider.ts:24-35，防止把 HTML/JSON 错误页
    // 当有效音频缓存），所以假音频必须带 ID3v2 头 —— 与 ttsEdgeProvider.test.ts 同一写法。
    const audioBytes = Buffer.from("ID3\0\0\0\0\0\0fish-audio");
    const audioArrayBuffer = new Uint8Array(audioBytes).buffer;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => audioArrayBuffer,
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
    expect(response.audioBuffer).toEqual(audioBytes);
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
