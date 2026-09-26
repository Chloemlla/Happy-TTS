import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import RecommendationHistoryModel from "../models/recommendationHistoryModel";
import UserPreferencesModel from "../models/userPreferencesModel";
import { RecommendationService } from "../services/recommendationService";
import type { GenerationRecord, VoiceStyle } from "../types/recommendation";
import logger from "../utils/logger";

jest.mock("../models/recommendationHistoryModel", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), aggregate: jest.fn(), findOneAndUpdate: jest.fn() },
}));

jest.mock("../models/userPreferencesModel", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const service = new RecommendationService();

function chain(value: unknown) {
  const settled = Promise.resolve(value);
  return {
    lean: () => settled,
    then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      settled.then(onFulfilled, onRejected),
  };
}

function style(id: string, over: Partial<VoiceStyle> = {}): VoiceStyle {
  return {
    id,
    name: `名称-${id}`,
    voice: "zh-CN-XiaoxiaoNeural",
    model: "neural",
    speed: 1,
    emotionalTone: "neutral",
    language: "zh-CN",
    ...over,
  };
}

/** 生成 count 条使用同一风格的历史记录（timestamp/textLength 等按需要覆写）。 */
function gens(styleId: string, count: number, over: Partial<GenerationRecord> = {}): GenerationRecord[] {
  return Array.from({ length: count }, (_unused, i) => ({
    id: `${styleId}-${i}`,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    textContent: "文本",
    textLength: 100,
    contentType: "article",
    language: "zh-CN",
    voiceStyle: style(styleId),
    duration: 0,
    ...over,
  }));
}

function mockHistory(generations: GenerationRecord[] | null) {
  (RecommendationHistoryModel.findOne as jest.Mock).mockReturnValue(
    chain(generations === null ? null : { userId: "u1", generations }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("recommendationService.getPersonalizedRecommendations", () => {
  it("历史不足 10 条时降级为热门推荐", async () => {
    mockHistory(gens("sa", 3));
    (RecommendationHistoryModel.aggregate as jest.Mock).mockResolvedValue([
      { voiceStyle: style("hot-1"), count: 9 },
      { voiceStyle: style("hot-2"), count: 4 },
    ]);

    const recs = await service.getPersonalizedRecommendations("u1");

    expect(recs).toHaveLength(2);
    expect(recs[0]).toEqual({
      voiceStyle: style("hot-1"),
      similarityScore: 0.5,
      reason: "社区热门推荐",
      sampleAudioUrl: "/samples/hot-1.mp3",
    });
    expect(UserPreferencesModel.findOne).not.toHaveBeenCalled();
  });

  it("完全无历史时也走热门，且数据库聚合为空时用内置默认风格", async () => {
    mockHistory(null);
    (RecommendationHistoryModel.aggregate as jest.Mock).mockResolvedValue([]);

    const recs = await service.getPersonalizedRecommendations("u1", 2);

    expect(recs.map((r) => r.voiceStyle.id)).toEqual(["popular-1", "popular-2"]);
    expect(recs[0].sampleAudioUrl).toBe("/samples/popular-1.mp3");
  });

  it("历史充足时按使用频次排序并给出相似度", async () => {
    mockHistory([...gens("sa", 5), ...gens("sb", 3), ...gens("sc", 2)]);
    (UserPreferencesModel.findOne as jest.Mock).mockReturnValue(chain(null));

    const recs = await service.getPersonalizedRecommendations("u1");

    expect(recs.map((r) => r.voiceStyle.id)).toEqual(["sa", "sb", "sc", "popular-1", "popular-2"]);
    expect(recs[0].similarityScore).toBe(1);
    expect(recs[1].similarityScore).toBeCloseTo(0.9, 10);
    expect(recs[2].similarityScore).toBeCloseTo(0.8, 10);
    expect(recs[0].reason).toBe("基于您的使用历史（使用5次）");
    // 补位的是热门风格，相似度固定在 0.4
    expect(recs[3]).toMatchObject({ similarityScore: 0.4, reason: "社区热门推荐" });
  });

  it("相似度不会低于 0.5", async () => {
    mockHistory(Array.from({ length: 12 }, (_unused, i) => gens(`s${i}`, 1)[0]));
    (UserPreferencesModel.findOne as jest.Mock).mockReturnValue(chain({ recommendationSettings: {} }));

    const recs = await service.getPersonalizedRecommendations("u1", 8);
    expect(recs.every((r) => r.similarityScore >= 0.5)).toBe(true);
    expect(recs).toHaveLength(8);
  });

  it("被禁用的分类既不入选也不补位", async () => {
    // sa 属于 calm 分类，被 disabledCategories 拦下
    mockHistory([
      ...gens("sa", 5).map((g) => ({ ...g, voiceStyle: style("sa", { emotionalTone: "calm" }) })),
      ...gens("sb", 3),
      ...gens("sc", 2),
    ]);
    (UserPreferencesModel.findOne as jest.Mock).mockReturnValue(
      chain({ recommendationSettings: { disabledCategories: ["calm"] } }),
    );

    const recs = await service.getPersonalizedRecommendations("u1");
    const ids = recs.map((r) => r.voiceStyle.id);

    expect(ids).not.toContain("sa");
    expect(ids).not.toContain("popular-3"); // 内置 popular-3 也是 calm
    expect(ids).toEqual(["sb", "sc", "popular-1", "popular-2", "popular-4"]);
  });

  it("读取历史抛错时回落到热门推荐", async () => {
    (RecommendationHistoryModel.findOne as jest.Mock).mockReturnValue(chain(Promise.reject(new Error("mongo down"))));
    (RecommendationHistoryModel.aggregate as jest.Mock).mockResolvedValue([]);

    const recs = await service.getPersonalizedRecommendations("u1", 3);
    expect(recs.map((r) => r.voiceStyle.id)).toEqual(["popular-1", "popular-2", "popular-3"]);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("recommendationService.getPopularStyles", () => {
  it("聚合管道按风格 id 统计、倒序、限量", async () => {
    (RecommendationHistoryModel.aggregate as jest.Mock).mockResolvedValue([]);
    await service.getPopularStyles(3);

    const pipeline = (RecommendationHistoryModel.aggregate as jest.Mock).mock.calls[0][0] as Array<Record<string, any>>;
    expect(pipeline[0]).toEqual({ $unwind: "$generations" });
    expect(pipeline[1]).toEqual({
      $group: {
        _id: "$generations.voiceStyle.id",
        voiceStyle: { $first: "$generations.voiceStyle" },
        count: { $sum: 1 },
      },
    });
    expect(pipeline[2]).toEqual({ $sort: { count: -1 } });
    expect(pipeline[3]).toEqual({ $limit: 3 });
  });

  it("聚合抛错时用内置默认风格兜底", async () => {
    (RecommendationHistoryModel.aggregate as jest.Mock).mockRejectedValue(new Error("boom"));
    const styles = await service.getPopularStyles(2);
    expect(styles.map((s) => s.id)).toEqual(["popular-1", "popular-2"]);
  });

  it("默认风格字段完整，limit 超量时被截断", async () => {
    (RecommendationHistoryModel.aggregate as jest.Mock).mockRejectedValue(new Error("boom"));
    const styles = await service.getPopularStyles(99);
    expect(styles).toHaveLength(5);
    expect(styles[0]).toEqual({
      id: "popular-1",
      name: "标准女声",
      voice: "zh-CN-XiaoxiaoNeural",
      model: "neural",
      speed: 1,
      emotionalTone: "neutral",
      language: "zh-CN",
    });
  });
});

describe("recommendationService.recordSelection", () => {
  it("写入的记录含内容类型、语言与截断后的正文", async () => {
    (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ ok: 1 });

    const text = "今天心情很平静，读一段安宁的文字。";
    await service.recordSelection("u1", "popular-2", text);

    const call = (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mock.calls[0];
    const [filter, update, options] = call as [unknown, any, unknown];
    expect(filter).toEqual({ userId: "u1" });
    expect(options).toEqual({ upsert: true, returnDocument: "after" });
    expect(update.$inc).toEqual({ totalCount: 1 });
    expect(update.$set.lastUpdated).toBeInstanceOf(Date);

    const record = update.$push.generations as GenerationRecord;
    expect(record.id).toMatch(/^gen-\d+-/);
    expect(record.voiceStyle.id).toBe("popular-2");
    expect(record.textLength).toBe(text.length);
    expect(record.textContent).toBe(text);
    expect(record.contentType).toBe("short"); // <50 字
    expect(record.language).toBe("zh-CN"); // 中文字符占比 > 30%
    expect(record.timestamp).toBeInstanceOf(Date);
    expect(record.duration).toBe(0);
  });

  it("正文超过 1000 字时只存前 1000 字，长度按原文统计", async () => {
    (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ ok: 1 });
    const long = "a".repeat(1500);
    await service.recordSelection("u1", "unknown-style", long);

    const call = (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mock.calls[0];
    const record = call[1].$push.generations as GenerationRecord;
    expect(record.textContent).toHaveLength(1000);
    expect(record.textLength).toBe(1500);
    expect(record.contentType).toBe("article");
    // 未知风格回落到自定义风格
    expect(record.voiceStyle).toMatchObject({ id: "unknown-style", name: "自定义风格", speed: 1 });
  });

  it("空文本按 short/en-US 处理", async () => {
    (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ ok: 1 });
    await service.recordSelection("u1", "popular-1");

    const call = (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mock.calls[0];
    const record = call[1].$push.generations as GenerationRecord;
    expect(record.contentType).toBe("short");
    expect(record.language).toBe("en-US");
    expect(record.textContent).toBe("");
  });

  it("写入失败时向上抛出", async () => {
    (RecommendationHistoryModel.findOneAndUpdate as jest.Mock).mockRejectedValue(new Error("write conflict"));
    await expect(service.recordSelection("u1", "popular-1", "x")).rejects.toThrow("write conflict");
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("recommendationService.analyzeContent", () => {
  it("中文Happy关键词命中 happy，并给出提速参数", async () => {
    const result = await service.analyzeContent("我今天很开心，也很高兴。");
    expect(result.emotionalMatch).toBe("happy");
    expect(result.voiceParameters).toEqual({ speed: 1.1, emotionalTone: "happy", language: "zh-CN" });
    expect(result.confidence).toBeCloseTo(0.7, 10);
    expect(result.chunkingStrategy).toBeUndefined();
  });

  it("悲伤/愤怒/神秘等情绪分别取对应语速", async () => {
    const cases: Array<[string, string, number]> = [
      ["这段回忆满是悲伤与失落", "sad", 0.85],
      ["我感到愤怒和恼火", "angry", 1.15],
      ["这是一个神秘的玄幻故事", "mysterious", 0.9],
      ["请保持严肃正式的语气", "serious", 0.95],
    ];
    for (const [text, tone, speed] of cases) {
      const result = await service.analyzeContent(text);
      expect({ tone: result.emotionalMatch, speed: result.voiceParameters.speed }).toEqual({ tone, speed });
    }
  });

  it("英文文本判为 en-US", async () => {
    const result = await service.analyzeContent("I am so happy and joyful today");
    expect(result.emotionalMatch).toBe("happy");
    expect(result.voiceParameters.language).toBe("en-US");
  });

  it("无关键词时 neutral，置信度 0.5", async () => {
    const result = await service.analyzeContent("The meeting is at noon");
    expect(result.emotionalMatch).toBe("neutral");
    expect(result.voiceParameters).toEqual({ speed: 1, emotionalTone: "neutral", language: "en-US" });
    expect(result.confidence).toBeCloseTo(0.5, 10);
  });

  it("超过 500 字触发分块策略（<1000 字 → 300/30）", async () => {
    const result = await service.analyzeContent("x".repeat(600));
    expect(result.chunkingStrategy).toEqual({ chunkSize: 300, overlapSize: 30, breakPoints: ["sentence"] });
    expect(result.confidence).toBeCloseTo(0.7, 10); // 0.5 + 0.1(>100) + 0.1(>300)
  });

  it("1000~2999 字用 500/50，>=3000 字用 800/80", async () => {
    // 每段 10 字：400 段 = 4000 字 → 800/80，且三种自然断点全部命中
    expect((await service.analyzeContent("段落。\n\n第二，句。".repeat(400))).chunkingStrategy).toEqual({
      chunkSize: 800,
      overlapSize: 80,
      breakPoints: ["paragraph", "sentence", "clause"],
    });
    expect((await service.analyzeContent("x".repeat(1200))).chunkingStrategy).toMatchObject({
      chunkSize: 500,
      overlapSize: 50,
    });
  });

  it("恰好 500 字不分块（阈值是 >500）", async () => {
    const result = await service.analyzeContent("x".repeat(500));
    expect(result.chunkingStrategy).toBeUndefined();
  });

  it("内部抛错时返回保守默认建议", async () => {
    const result = await service.analyzeContent(null as never);
    expect(result).toEqual({
      voiceParameters: { speed: 1, emotionalTone: "neutral" },
      emotionalMatch: "neutral",
      confidence: 0.3,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("recommendationService ContentSuggestion 序列化", () => {
  it("序列化后再解析得到等价对象", async () => {
    const suggestion = await service.analyzeContent("x".repeat(600));
    const json = service.serializeContentSuggestion(suggestion);
    expect(JSON.parse(json).emotionalMatch).toBe(suggestion.emotionalMatch);
    expect(service.parseContentSuggestion(json)).toEqual(suggestion);
  });

  it("不含 chunkingStrategy 的建议也合法", () => {
    const json = JSON.stringify({ voiceParameters: { speed: 1 }, emotionalMatch: "neutral", confidence: 0.5 });
    expect(service.parseContentSuggestion(json)).toMatchObject({ emotionalMatch: "neutral" });
  });

  it("非法 JSON 抛解析错误", () => {
    expect(() => service.parseContentSuggestion("{oops")).toThrow(/Failed to parse ContentSuggestion/);
  });

  const invalidSuggestions: Array<[string, unknown]> = [
    ["缺 emotionalMatch", { voiceParameters: {}, confidence: 0.5 }],
    ["confidence 非数字", { voiceParameters: {}, emotionalMatch: "calm", confidence: "0.5" }],
    ["confidence 越界", { voiceParameters: {}, emotionalMatch: "calm", confidence: 1.5 }],
    ["缺 voiceParameters", { emotionalMatch: "calm", confidence: 0.5 }],
    [
      "chunkingStrategy 缺 overlapSize",
      {
        voiceParameters: {},
        emotionalMatch: "calm",
        confidence: 0.5,
        chunkingStrategy: { chunkSize: 300, breakPoints: [] },
      },
    ],
    [
      "chunkingStrategy 非对象",
      { voiceParameters: {}, emotionalMatch: "calm", confidence: 0.5, chunkingStrategy: "300" },
    ],
  ];

  it.each(invalidSuggestions)("%s", async (_label, payload) => {
    await expect(() => service.parseContentSuggestion(JSON.stringify(payload))).toThrow(
      /Invalid ContentSuggestion format/,
    );
  });
});
