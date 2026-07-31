import { OpenAiTtsProvider } from "../tts/tts.provider";

describe("OpenAiTtsProvider configuration boundary", () => {
  it("constructs without an API key and fails only when synthesis is requested", async () => {
    const provider = new OpenAiTtsProvider({ apiKey: "" });

    await expect(
      provider.synthesize({
        text: "hello",
        model: "tts-1",
        voice: "alloy",
        outputFormat: "mp3",
        speed: 1,
      }),
    ).rejects.toMatchObject({
      name: "TtsGenerationError",
      statusCode: 503,
      code: "TTS_PROVIDER_NOT_CONFIGURED",
      retryable: false,
    });
  });
});
