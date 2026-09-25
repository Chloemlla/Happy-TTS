import { EDGE_DEFAULT_BASE_URL } from "../config/ttsProviderConfig";
import {
  EDGE_AUDIO_OUTPUT_FORMAT,
  EDGE_MAX_CHUNK_CHARS,
  buildEdgeSpeechConfigMessage,
  buildEdgeSsmlMessage,
  buildEdgeVoiceListUrl,
  createEdgeConnectionId,
  createEdgeRequestId,
  formatEdgeTimestamp,
  isEdgeVoiceId,
  resolveEdgeLocale,
  splitEdgeText,
  toEdgeProsodyRate,
} from "../tts/edge/edge.protocol";

const FIXED_DATE = new Date("2025-09-25T12:00:00Z");
const EDGE_VOICES_URL = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list";

/** 块内不允许出现落单的代理码元：高位代理必须紧跟低位代理，低位代理前必须是高位代理。 */
function hasLoneSurrogate(chunk: string): boolean {
  for (let index = 0; index < chunk.length; index += 1) {
    const unit = chunk.charCodeAt(index);
    if ((unit & 0xfc00) === 0xd800) {
      if ((chunk.charCodeAt(index + 1) & 0xfc00) !== 0xdc00) return true;
      index += 1;
      continue;
    }
    if ((unit & 0xfc00) === 0xdc00) return true;
  }
  return false;
}

describe("Edge 朗读协议", () => {
  describe("isEdgeVoiceId", () => {
    it("accepts upstream Neural voice ids", () => {
      expect(isEdgeVoiceId("zh-CN-XiaoxiaoNeural")).toBe(true);
      expect(isEdgeVoiceId("en-US-AriaNeural")).toBe(true);
      expect(isEdgeVoiceId("zh-CN-liaoning-XiaobeiNeural")).toBe(true);
    });

    it("rejects OpenAI style names and truncated ids", () => {
      expect(isEdgeVoiceId("nova")).toBe(false);
      expect(isEdgeVoiceId("tts-1")).toBe(false);
      expect(isEdgeVoiceId("zh-CN-Xiaoxiao")).toBe(false);
      expect(isEdgeVoiceId("")).toBe(false);
      expect(isEdgeVoiceId("zh-CN-XiaoxiaoNeural!")).toBe(false);
    });

    it("rejects non-string values", () => {
      expect(isEdgeVoiceId(null)).toBe(false);
      expect(isEdgeVoiceId(undefined)).toBe(false);
      expect(isEdgeVoiceId(42)).toBe(false);
      expect(isEdgeVoiceId({ id: "en-US-AriaNeural" })).toBe(false);
    });

    it("tolerates surrounding whitespace", () => {
      expect(isEdgeVoiceId("zh-CN-XiaoxiaoNeural ")).toBe(true);
      expect(isEdgeVoiceId(" en-US-AriaNeural")).toBe(true);
    });
  });

  describe("formatEdgeTimestamp", () => {
    it("formats the UTC timestamp without a trailing Z for speech.config", () => {
      expect(formatEdgeTimestamp(FIXED_DATE)).toBe("Thu Sep 25 2025 12:00:00 GMT+0000 (Coordinated Universal Time)");
    });

    it("appends Z for SSML messages", () => {
      expect(formatEdgeTimestamp(FIXED_DATE, true)).toBe(
        "Thu Sep 25 2025 12:00:00 GMT+0000 (Coordinated Universal Time)Z",
      );
    });
  });

  describe("toEdgeProsodyRate", () => {
    it("maps the speed multiplier to a prosody percentage", () => {
      expect(toEdgeProsodyRate(1)).toBe("+0%");
      expect(toEdgeProsodyRate(1.5)).toBe("+50%");
      expect(toEdgeProsodyRate(0.75)).toBe("-25%");
      expect(toEdgeProsodyRate(2)).toBe("+100%");
    });

    it("clamps speeds outside 0.25–4 and non-finite input", () => {
      expect(toEdgeProsodyRate(10)).toBe("+300%");
      expect(toEdgeProsodyRate(0.1)).toBe("-75%");
      expect(toEdgeProsodyRate(Number.NaN)).toBe("+0%");
    });
  });

  describe("resolveEdgeLocale", () => {
    it("reads the locale from the voice id", () => {
      expect(resolveEdgeLocale("zh-CN-XiaoxiaoNeural")).toBe("zh-CN");
      expect(resolveEdgeLocale("en-US-AriaNeural")).toBe("en-US");
      expect(resolveEdgeLocale("zh-CN-liaoning-XiaobeiNeural")).toBe("zh-CN");
    });

    it("falls back to en-US for anything else", () => {
      expect(resolveEdgeLocale("nova")).toBe("en-US");
      expect(resolveEdgeLocale("")).toBe("en-US");
    });
  });

  describe("splitEdgeText", () => {
    it("returns no chunk for empty or whitespace-only text", () => {
      expect(splitEdgeText("")).toEqual([]);
      expect(splitEdgeText("   \n\t ")).toEqual([]);
    });

    it("keeps a short text in a single chunk", () => {
      expect(splitEdgeText("你好，世界。")).toEqual(["你好，世界。"]);
    });

    it("cuts long text after sentence punctuation without losing characters", () => {
      const longText = "这是一段用于验证分块的中文文本。".repeat(200);

      const chunks = splitEdgeText(longText);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every((chunk) => chunk.length <= EDGE_MAX_CHUNK_CHARS)).toBe(true);
      expect(chunks.join("")).toBe(longText);
      for (const chunk of chunks.slice(0, -1)) {
        expect(chunk).toMatch(/[。！？!?；;…\n]$/);
      }
    });

    it("treats a whitespace-terminated period as a sentence boundary", () => {
      const englishText = "This is a sentence. ".repeat(100);

      const chunks = splitEdgeText(englishText);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].endsWith(".")).toBe(true);
    });

    it("does not treat a decimal point as a sentence boundary", () => {
      const decimalText = `${"x".repeat(1400)}3.14${"y".repeat(300)}`;

      const chunks = splitEdgeText(decimalText);

      expect(chunks[0]).toContain("3.14");
      expect(chunks[0].endsWith("3.")).toBe(false);
      expect(chunks.every((chunk) => chunk.length <= EDGE_MAX_CHUNK_CHARS)).toBe(true);
    });

    it("hard-cuts punctuation-free text within the limit", () => {
      const plainText = "a".repeat(EDGE_MAX_CHUNK_CHARS + 500);

      const chunks = splitEdgeText(plainText);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every((chunk) => chunk.length <= EDGE_MAX_CHUNK_CHARS)).toBe(true);
      expect(chunks.join("")).toBe(plainText);
    });

    it("hard-cuts surrogate pair text within the limit and loses no character", () => {
      const emojiText = "😀".repeat(1000);

      const chunks = splitEdgeText(emojiText);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every((chunk) => chunk.length <= EDGE_MAX_CHUNK_CHARS)).toBe(true);
      expect(chunks.join("")).toBe(emojiText);
      expect(chunks.every((chunk) => !hasLoneSurrogate(chunk))).toBe(true);
    });

    it("keeps every surrogate pair inside one chunk for odd and even limits alike", () => {
      const emojiText = "😀".repeat(2000);
      const limits = [3, 4, 5, 7, 1499, EDGE_MAX_CHUNK_CHARS];

      for (const limit of limits) {
        const chunks = splitEdgeText(emojiText, limit);

        expect(chunks.join("")).toBe(emojiText);
        expect(chunks.every((chunk) => !hasLoneSurrogate(chunk))).toBe(true);
        expect(chunks.every((chunk) => chunk.length <= limit && chunk.length > 0)).toBe(true);
      }
    });
  });

  describe("connection identifiers", () => {
    it("creates distinct 32 char lowercase hex ids", () => {
      const connectionId = createEdgeConnectionId();
      const requestId = createEdgeRequestId();

      expect(connectionId).toMatch(/^[0-9a-f]{32}$/);
      expect(requestId).toMatch(/^[0-9a-f]{32}$/);
      expect(connectionId).not.toBe(createEdgeConnectionId());
      expect(requestId).not.toBe(createEdgeRequestId());
    });
  });

  describe("buildEdgeSpeechConfigMessage", () => {
    it("announces the audio output format on the speech.config path", () => {
      const message = buildEdgeSpeechConfigMessage(FIXED_DATE);

      expect(message).toContain("Path:speech.config");
      expect(message).toContain("Content-Type:application/json; charset=utf-8");
      const body = JSON.parse(message.slice(message.indexOf("{")));
      expect(body.context.synthesis.audio.outputFormat).toBe(EDGE_AUDIO_OUTPUT_FORMAT);
    });
  });

  describe("buildEdgeSsmlMessage", () => {
    it("escapes XML and takes xml:lang from the voice locale", () => {
      const message = buildEdgeSsmlMessage("<b> & 'x' \"y\"", "zh-CN-XiaoxiaoNeural", 1.5, {
        requestId: "request-1",
        date: FIXED_DATE,
      });

      expect(message).toContain("Path:ssml");
      expect(message).toContain("Content-Type:application/ssml+xml");
      expect(message).toContain("X-RequestId:request-1");
      expect(message).toContain("xml:lang='zh-CN'");
      expect(message).toContain("<voice name='zh-CN-XiaoxiaoNeural'>");
      expect(message).toContain("<prosody rate='+50%'>&lt;b&gt; &amp; &apos;x&apos; &quot;y&quot;</prosody>");
      expect(message).not.toContain("<b> &");
    });

    it("closes the SSML timestamp with the Z suffix", () => {
      const message = buildEdgeSsmlMessage("你好", "en-US-AriaNeural", 1, {
        requestId: "request-2",
        date: FIXED_DATE,
      });

      expect(message).toContain("X-Timestamp:Thu Sep 25 2025 12:00:00 GMT+0000 (Coordinated Universal Time)Z");
    });
  });

  describe("buildEdgeVoiceListUrl", () => {
    it("keeps the host of the configured base url and uses the fixed voices path", () => {
      expect(buildEdgeVoiceListUrl(EDGE_DEFAULT_BASE_URL)).toBe(EDGE_VOICES_URL);
      expect(buildEdgeVoiceListUrl("wss://speech.example.test:8443/some/path")).toBe(
        "https://speech.example.test:8443/consumer/speech/synthesize/readaloud/voices/list",
      );
    });

    it("falls back to the upstream host when the base url is unusable", () => {
      expect(buildEdgeVoiceListUrl("not a url")).toBe(EDGE_VOICES_URL);
      expect(buildEdgeVoiceListUrl("")).toBe(EDGE_VOICES_URL);
    });
  });
});
