import { describe, expect, it } from "vitest";
import {
  FISH_DEFAULT_TTS_MODEL,
  getTtsOutputFormats,
  normalizeTtsProviderConfig,
} from "./ttsProviderConfig";

describe("normalizeTtsProviderConfig", () => {
  it("limits Fish Audio output to MP3 while preserving OpenAI formats", () => {
    expect(getTtsOutputFormats("fish")).toEqual(["mp3"]);
    expect(getTtsOutputFormats("openai")).toEqual(["mp3", "opus", "aac", "flac"]);
  });

  it("falls back to the existing OpenAI choices for an invalid payload", () => {
    const config = normalizeTtsProviderConfig({ provider: "unknown" });

    expect(config.provider).toBe("openai");
    expect(config.defaultModel).toBe("tts-1-hd");
    expect(config.defaultVoice).toBe("nova");
    expect(config.models.map((option) => option.id)).toEqual(["tts-1", "tts-1-hd"]);
  });

  it("replaces a stale OpenAI model and removes selectable voices for configured Fish references", () => {
    const config = normalizeTtsProviderConfig({
      provider: "fish",
      defaultModel: "tts-1-hd",
      models: ["tts-1-hd"],
      voiceMode: "configured_reference",
    });

    expect(config.defaultModel).toBe(FISH_DEFAULT_TTS_MODEL);
    expect(config.models.map((option) => option.id)).toContain(FISH_DEFAULT_TTS_MODEL);
    expect(config.models.map((option) => option.id)).not.toContain("tts-1-hd");
    expect(config.voiceMode).toBe("configured_reference");
    expect(config.defaultVoice).toBeUndefined();
  });

  it("preserves an administrator-selected Fish model without advertising unsupported alternatives", () => {
    const config = normalizeTtsProviderConfig({
      provider: "fish",
      defaultModel: "fish-custom",
      models: [{ id: "fish-custom", name: "Fish Custom" }],
      voiceMode: "provider_default",
    });

    expect(config.defaultModel).toBe("fish-custom");
    expect(config.models.map((option) => option.id)).toEqual(["fish-custom"]);
  });

  it("uses Fish capability voices when the endpoint supplies them", () => {
    const config = normalizeTtsProviderConfig({
      provider: "fish",
      defaultModel: FISH_DEFAULT_TTS_MODEL,
      models: [{ id: FISH_DEFAULT_TTS_MODEL, name: "Fish S2.1" }],
      voices: [{ id: "reference-a", name: "参考音色 A" }],
    });

    expect(config.voiceMode).toBe("select");
    expect(config.defaultVoice).toBe("reference-a");
  });

  it.each(["config", "providerConfig", "data"] as const)(
    "accepts the %s response envelope",
    (wrapperKey) => {
      const config = normalizeTtsProviderConfig({
        [wrapperKey]: {
          provider: "fish",
          defaultModel: FISH_DEFAULT_TTS_MODEL,
          models: [FISH_DEFAULT_TTS_MODEL],
          voices: [],
          voiceMode: "provider_default",
        },
      });

      expect(config.provider).toBe("fish");
      expect(config.defaultModel).toBe(FISH_DEFAULT_TTS_MODEL);
    },
  );

  it("ignores a default voice that is not present in the advertised choices", () => {
    const config = normalizeTtsProviderConfig({
      provider: "openai",
      defaultModel: "tts-1-hd",
      defaultVoice: "missing-voice",
      voices: [{ id: "alloy", name: "Alloy" }],
    });

    expect(config.defaultVoice).toBe("alloy");
  });
});
