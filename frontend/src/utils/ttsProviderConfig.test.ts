import { describe, expect, it } from "vitest";
import {
  EDGE_DEFAULT_TTS_MODEL,
  EDGE_DEFAULT_TTS_VOICE,
  FISH_DEFAULT_TTS_MODEL,
  getTtsOutputFormats,
  isTtsProviderConfigPayload,
  normalizeTtsProviderConfig,
  supportsTtsSpeed,
} from "./ttsProviderConfig";

describe("normalizeTtsProviderConfig", () => {
  it("limits Fish Audio output to MP3 while preserving OpenAI formats", () => {
    expect(getTtsOutputFormats("fish")).toEqual(["mp3"]);
    expect(getTtsOutputFormats("openai")).toEqual(["mp3", "opus", "aac", "flac"]);
  });

  it("only exposes speed adjustment for providers that honor it", () => {
    expect(supportsTtsSpeed("openai")).toBe(true);
    expect(supportsTtsSpeed("fish")).toBe(false);
  });

  it("falls back to the existing OpenAI choices for an invalid payload", () => {
    const config = normalizeTtsProviderConfig({ provider: "unknown" });

    expect(config.provider).toBe("openai");
    expect(config.defaultModel).toBe("tts-1-hd");
    expect(config.defaultVoice).toBe("nova");
    expect(config.models.map((option) => option.id)).toEqual(["tts-1", "tts-1-hd"]);
    expect(isTtsProviderConfigPayload({ provider: "unknown" })).toBe(false);
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

  it("limits Edge output to MP3 while still exposing speed adjustment", () => {
    expect(getTtsOutputFormats("edge")).toEqual(["mp3"]);
    expect(supportsTtsSpeed("edge")).toBe(true);
  });

  it("accepts an Edge payload and keeps Microsoft's own model, voice and selectable voices", () => {
    const payload = {
      success: true,
      config: {
        provider: "edge",
        defaultModel: EDGE_DEFAULT_TTS_MODEL,
        defaultVoice: EDGE_DEFAULT_TTS_VOICE,
        models: [{ id: EDGE_DEFAULT_TTS_MODEL, name: "Edge 朗读" }],
        voices: [
          { id: EDGE_DEFAULT_TTS_VOICE, name: "晓晓", description: "Chinese (Mandarin, Simplified) · 女" },
        ],
        voiceMode: "select",
      },
    };

    expect(isTtsProviderConfigPayload(payload)).toBe(true);
    const config = normalizeTtsProviderConfig(payload);

    expect(config.provider).toBe("edge");
    expect(config.defaultModel).toBe(EDGE_DEFAULT_TTS_MODEL);
    expect(config.models.map((option) => option.id)).toEqual([EDGE_DEFAULT_TTS_MODEL]);
    expect(config.voiceMode).toBe("select");
    expect(config.defaultVoice).toBe(EDGE_DEFAULT_TTS_VOICE);
  });

  it("never treats another provider's model as the Edge default", () => {
    const config = normalizeTtsProviderConfig({
      provider: "edge",
      defaultModel: "tts-1-hd",
      models: ["tts-1-hd"],
      voices: [{ id: EDGE_DEFAULT_TTS_VOICE, name: "晓晓" }],
      voiceMode: "select",
    });

    expect(config.defaultModel).toBe(EDGE_DEFAULT_TTS_MODEL);
    expect(config.models.map((option) => option.id)).not.toContain("tts-1-hd");
  });
});

describe("normalizeTtsProviderConfig providers 列表", () => {
  it("按序归一化 providers，丢弃非法项与重复项", () => {
    const config = normalizeTtsProviderConfig({
      provider: "openai",
      defaultModel: "tts-1-hd",
      models: ["tts-1", "tts-1-hd"],
      voices: [{ id: "nova", name: "Nova" }],
      providers: [
        { provider: "openai", defaultModel: "tts-1-hd", models: ["tts-1-hd"], voices: ["nova"] },
        { provider: "bogus", defaultModel: "whatever" },
        { notAProvider: true },
        {
          provider: "fish",
          defaultModel: FISH_DEFAULT_TTS_MODEL,
          models: [FISH_DEFAULT_TTS_MODEL],
          voices: [],
          voiceMode: "provider_default",
        },
        // 重复的 fish：应被丢弃，且保留先出现的那一份
        { provider: "fish", defaultModel: "fish-dup", models: ["fish-dup"] },
        {
          provider: "edge",
          defaultModel: EDGE_DEFAULT_TTS_MODEL,
          defaultVoice: EDGE_DEFAULT_TTS_VOICE,
          models: [EDGE_DEFAULT_TTS_MODEL],
          voices: [EDGE_DEFAULT_TTS_VOICE],
          voiceMode: "select",
        },
      ],
    });

    expect(config.providers?.map((entry) => entry.provider)).toEqual(["openai", "fish", "edge"]);
    // 主配置来自扁平字段，且恒排第一
    expect(config.providers?.[0].provider).toBe(config.provider);
    expect(config.providers?.[1].defaultModel).toBe(FISH_DEFAULT_TTS_MODEL);
    expect(config.providers?.[2].defaultVoice).toBe(EDGE_DEFAULT_TTS_VOICE);
  });

  it("后端不返回 providers 时回退成 [主配置]", () => {
    const config = normalizeTtsProviderConfig({
      provider: "fish",
      defaultModel: FISH_DEFAULT_TTS_MODEL,
      models: [FISH_DEFAULT_TTS_MODEL],
      voices: [],
      voiceMode: "provider_default",
    });

    expect(config.providers).toHaveLength(1);
    expect(config.providers?.[0].provider).toBe(config.provider);
    expect(config.providers?.[0].defaultModel).toBe(config.defaultModel);

    // 回退路径（payload 非法）同样保证 providers 非空，切换控件才拿得到列表
    const fallback = normalizeTtsProviderConfig({ provider: "unknown" });
    expect(fallback.providers).toHaveLength(1);
    expect(fallback.providers?.[0].provider).toBe("openai");

    // providers 不是数组时也不能抛错
    const notAnArray = normalizeTtsProviderConfig({ provider: "edge", providers: { provider: "fish" } });
    expect(notAnArray.providers?.map((entry) => entry.provider)).toEqual(["edge"]);
  });

  it("每个子配置按各自 provider 归一化，模型/音色不串味", () => {
    const config = normalizeTtsProviderConfig({
      provider: "openai",
      defaultModel: "tts-1-hd",
      models: ["tts-1", "tts-1-hd"],
      voices: ["nova"],
      providers: [
        { provider: "openai", defaultModel: "tts-1-hd", models: ["tts-1", "tts-1-hd"], voices: ["nova"] },
        {
          provider: "fish",
          // 别家的模型 ID 对 fish 非法，应被丢弃并回落到 Fish 默认模型
          defaultModel: "tts-1-hd",
          models: ["tts-1-hd"],
          voices: [{ id: "reference-a", name: "参考音色 A" }],
        },
        {
          provider: "edge",
          defaultModel: EDGE_DEFAULT_TTS_MODEL,
          defaultVoice: EDGE_DEFAULT_TTS_VOICE,
          models: [EDGE_DEFAULT_TTS_MODEL],
          voices: [{ id: EDGE_DEFAULT_TTS_VOICE, name: "晓晓" }],
          voiceMode: "select",
        },
      ],
    });

    const fish = config.providers?.find((entry) => entry.provider === "fish");
    expect(fish?.defaultModel).toBe(FISH_DEFAULT_TTS_MODEL);
    expect(fish?.models.map((option) => option.id)).not.toContain("tts-1-hd");
    expect(fish?.voiceMode).toBe("select");
    expect(fish?.defaultVoice).toBe("reference-a");

    const edge = config.providers?.find((entry) => entry.provider === "edge");
    expect(edge?.defaultModel).toBe(EDGE_DEFAULT_TTS_MODEL);
    expect(edge?.defaultVoice).toBe(EDGE_DEFAULT_TTS_VOICE);
    expect(edge?.voiceMode).toBe("select");
    expect(edge?.models.map((option) => option.id)).toEqual([EDGE_DEFAULT_TTS_MODEL]);

    // 主配置仍是 OpenAI，不受子项影响
    expect(config.provider).toBe("openai");
    expect(config.defaultModel).toBe("tts-1-hd");
  });
});
