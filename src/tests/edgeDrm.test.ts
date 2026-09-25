import { generateEdgeMuid, generateEdgeSecMsGec, parseEdgeClockSkewSeconds } from "../tts/edge/edge.drm";

// 1758796800000 秒数部分正好落在 300 秒窗口的边界上。
const WINDOW_START_MS = 1_758_796_800_000;
const WINDOW_START_WITHIN_MS = WINDOW_START_MS + 91_000;
const NEXT_WINDOW_MS = WINDOW_START_MS + 300_000;

const HASH_FOR_WINDOW_START = "41001DB3925C7E81C5BE31104EC595A55E79FD9331CB89D494FD12BB2E79A3E9";
const HASH_FOR_NEXT_WINDOW = "C7CE337E67DDA599F97550701856B11F73AD853884A88A13513CE55C0ECDD69A";
const HASH_FOR_PREVIOUS_WINDOW = "70B4456D520ED4E3EB16ACCBA01FB231C24865933D1E6E1CD9072E486DC6AC17";

describe("Edge DRM 参数", () => {
  describe("generateEdgeSecMsGec", () => {
    it("hashes the aligned tick count together with the trusted client token", () => {
      expect(generateEdgeSecMsGec(WINDOW_START_MS, 0)).toBe(HASH_FOR_WINDOW_START);
      expect(generateEdgeSecMsGec(NEXT_WINDOW_MS, 0)).toBe(HASH_FOR_NEXT_WINDOW);
    });

    it("maps a +300s skew onto the same window as a timestamp 300s later", () => {
      expect(generateEdgeSecMsGec(WINDOW_START_MS, 300)).toBe(HASH_FOR_NEXT_WINDOW);
    });

    it("moves to an earlier window for a large negative skew", () => {
      expect(generateEdgeSecMsGec(WINDOW_START_MS, -90_000)).toBe(HASH_FOR_PREVIOUS_WINDOW);
    });

    it("aligns every timestamp inside the same five minute window", () => {
      expect(generateEdgeSecMsGec(WINDOW_START_WITHIN_MS, 0)).toBe(HASH_FOR_WINDOW_START);
      expect(generateEdgeSecMsGec(WINDOW_START_WITHIN_MS + 208_999, 0)).toBe(HASH_FOR_WINDOW_START);
    });

    it("is deterministic and always returns 64 uppercase hex characters", () => {
      const first = generateEdgeSecMsGec(WINDOW_START_MS, 0);

      expect(first).toBe(generateEdgeSecMsGec(WINDOW_START_MS, 0));
      expect(first).toMatch(/^[0-9A-F]{64}$/);
    });
  });

  describe("parseEdgeClockSkewSeconds", () => {
    it("returns zero when the Date header is missing or unparsable", () => {
      expect(parseEdgeClockSkewSeconds(null, WINDOW_START_MS)).toBe(0);
      expect(parseEdgeClockSkewSeconds(undefined, WINDOW_START_MS)).toBe(0);
      expect(parseEdgeClockSkewSeconds("", WINDOW_START_MS)).toBe(0);
      expect(parseEdgeClockSkewSeconds("not a date", WINDOW_START_MS)).toBe(0);
    });

    it("ignores a skew below the 30 second threshold", () => {
      const header = new Date(WINDOW_START_MS + 10_000).toUTCString();

      expect(parseEdgeClockSkewSeconds(header, WINDOW_START_MS + 20_000)).toBe(0);
      expect(parseEdgeClockSkewSeconds(new Date(WINDOW_START_MS).toUTCString(), WINDOW_START_MS + 29_000)).toBe(0);
    });

    it("returns the signed skew once it reaches the threshold", () => {
      expect(parseEdgeClockSkewSeconds(new Date(WINDOW_START_MS).toUTCString(), WINDOW_START_MS + 30_000)).toBe(-30);
      expect(parseEdgeClockSkewSeconds(new Date(WINDOW_START_MS).toUTCString(), WINDOW_START_MS + 120_000)).toBe(-120);
      expect(parseEdgeClockSkewSeconds(new Date(WINDOW_START_MS + 60_000).toUTCString(), WINDOW_START_MS)).toBe(60);
    });
  });

  describe("generateEdgeMuid", () => {
    it("builds a fresh 32 character uppercase hex id per call", () => {
      const muid = generateEdgeMuid();

      expect(muid).toMatch(/^[0-9A-F]{32}$/);
      expect(muid).not.toBe(generateEdgeMuid());
    });
  });
});
