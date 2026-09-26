import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import RecommendationHistoryModel from "../models/recommendationHistoryModel";
import { UsageAnalyticsService } from "../services/usageAnalyticsService";
import type { GenerationRecord, VoiceStyle } from "../types/recommendation";
import logger from "../utils/logger";

jest.mock("../models/recommendationHistoryModel", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockFindOne = RecommendationHistoryModel.findOne as jest.Mock;
const service = new UsageAnalyticsService();

/** 本地时区构造，避免 CI(TZ=UTC) 与开发机(UTC+8) 下 getHours()/getDay() 结论不同。 */
const AT = new Date(2026, 8, 14, 13, 30, 0);

function makeStyle(over: Partial<VoiceStyle> & { id?: string } = {}, i = 0): VoiceStyle {
  return {
    id: over.id ?? `style-${i}`,
    name: over.name ?? `风格${i}`,
    voice: over.voice ?? "zh-CN-XiaoxiaoNeural",
    model: over.model ?? "neural",
    speed: over.speed ?? 1.0,
    emotionalTone: over.emotionalTone ?? "neutral",
    language: over.language ?? "zh-CN",
  };
}

interface GenSeed {
  id?: string;
  timestamp?: Date;
  textLength?: number;
  contentType?: string;
  language?: string;
  style?: Partial<VoiceStyle> & { id?: string };
}

function makeGen(seed: GenSeed, i: number): GenerationRecord {
  const textLength = seed.textLength ?? 100;
  return {
    id: seed.id ?? `gen-${i}`,
    timestamp: seed.timestamp ?? AT,
    textContent: "字".repeat(Math.max(0, Math.floor(textLength / 2))),
    textLength,
    contentType: seed.contentType ?? "article",
    language: seed.language ?? "zh-CN",
    voiceStyle: makeStyle(seed.style ?? {}, i),
    duration: 0,
  };
}

function generations(count: number, seed: GenSeed = {}): GenerationRecord[] {
  return Array.from({ length: count }, (_unused, i) => makeGen({ ...seed, id: seed.id ?? `gen-${i}` }, i));
}

/** 同一 mock 会被 getStatistics / getOptimizationSuggestions / exportData 各调一次。 */
function mockHistoryDocs(gens: GenerationRecord[] | null) {
  mockFindOne.mockReturnValue({
    lean: () => Promise.resolve(gens === null ? null : { userId: "u1", generations: gens }),
  });
}

function mockHistoryFailure(error: unknown) {
  const reject = () => Promise.reject(error instanceof Error ? error : new Error(String(error)));
  mockFindOne.mockReturnValue({ lean: reject });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("usageAnalyticsService.getStatistics", () => {
  it("没有历史记录时返回全零统计", async () => {
    mockHistoryDocs(null);
    await expect(service.getStatistics("u1")).resolves.toEqual({
      totalGenerations: 0,
      favoriteStyles: [],
      peakUsageTimes: [],
      averageTextLength: 0,
      mostUsedLanguages: [],
    });
    expect(mockFindOne).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("generations 为空数组也走空统计", async () => {
    mockHistoryDocs([]);
    const stats = await service.getStatistics("u1");
    expect(stats.totalGenerations).toBe(0);
    expect(stats.peakUsageTimes).toEqual([]);
  });

  it("统计风格 Top5、平均文本长度、语言占比与高峰时段", async () => {
    const sameConfig = { style: { id: "style-a", name: "A", emotionalTone: "calm" } };
    mockHistoryDocs([
      makeGen({ ...sameConfig, id: "a1", textLength: 100, language: "zh-CN" }, 1),
      makeGen({ ...sameConfig, id: "a2", textLength: 100, language: "zh-CN" }, 2),
      makeGen({ ...sameConfig, id: "a3", textLength: 100, language: "zh-CN" }, 3),
      makeGen(
        {
          id: "b1",
          timestamp: new Date(2026, 8, 15, 20, 0, 0),
          textLength: 260,
          language: "en-US",
          style: { id: "style-b" },
        },
        4,
      ),
    ]);

    const stats = await service.getStatistics("u1");

    expect(stats.totalGenerations).toBe(4);
    // (100*3 + 260) / 4 = 140
    expect(stats.averageTextLength).toBe(140);
    expect(stats.favoriteStyles.map((s) => s.id)).toEqual(["style-a", "style-b"]);
    expect(stats.mostUsedLanguages).toEqual([
      { language: "zh-CN", percentage: 75 },
      { language: "en-US", percentage: 25 },
    ]);
    // 三条同一 周三 13 点的记录聚合成同一时段，且排在前面
    expect(stats.peakUsageTimes[0]).toEqual({ hour: AT.getHours(), dayOfWeek: AT.getDay(), count: 3 });
    expect(stats.peakUsageTimes).toHaveLength(2);
  });

  it("只取最常用的前 5 个风格", async () => {
    // 11 条 → 6 个不同风格（每个至少 2 次），Top5 截断生效
    mockHistoryDocs(
      Array.from({ length: 11 }, (_unused, i) => makeGen({ style: { id: `s-${Math.floor(i / 2)}` }, id: `g${i}` }, i)),
    );
    const stats = await service.getStatistics("u1");
    expect(stats.favoriteStyles).toHaveLength(5);
  });

  it("数据层抛错时降级为空统计而不是抛出", async () => {
    mockHistoryFailure(new Error("mongo down"));
    await expect(service.getStatistics("u1")).resolves.toMatchObject({ totalGenerations: 0 });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("usageAnalyticsService.detectRepetitivePatterns", () => {
  it("不足 3 次重复不算模式（阈值 3）", async () => {
    mockHistoryDocs(generations(2, { style: { id: "s1" } }));
    await expect(service.detectRepetitivePatterns("u1")).resolves.toEqual([]);
  });

  it("同一语音配置重复 3 次产出模板模式", async () => {
    mockHistoryDocs(
      generations(3, { style: { id: "s1", name: "温柔女声", emotionalTone: "calm" }, contentType: "notice" }),
    );
    const patterns = await service.detectRepetitivePatterns("u1");
    const configPattern = patterns.find((p) => p.patternType === "温柔女声 (calm)");
    expect(configPattern).toBeDefined();
    expect(configPattern?.frequency).toBe(3);
    expect(configPattern?.suggestion).toContain("建议创建模板");
  });

  it("speed 或 emotionalTone 不同即视为不同配置", async () => {
    // contentType 逐条不同，避免内容类型分组把这三条重新聚成同一模式
    mockHistoryDocs([
      makeGen({ id: "1", contentType: "c1", style: { id: "s1", speed: 1.0 } }, 1),
      makeGen({ id: "2", contentType: "c2", style: { id: "s1", speed: 1.1 } }, 2),
      makeGen({ id: "3", contentType: "c3", style: { id: "s1", speed: 1.0, emotionalTone: "happy" } }, 3),
    ]);
    await expect(service.detectRepetitivePatterns("u1")).resolves.toEqual([]);
  });

  it("按内容类型聚合，并要求该风格至少出现 2 次", async () => {
    mockHistoryDocs([
      makeGen({ id: "1", contentType: "podcast", style: { id: "s1", name: "S1" } }, 1),
      makeGen({ id: "2", contentType: "podcast", style: { id: "s1", name: "S1" } }, 2),
      makeGen({ id: "3", contentType: "podcast", style: { id: "s2", name: "S2" } }, 3),
    ]);
    const patterns = await service.detectRepetitivePatterns("u1");
    const byContent = patterns.find((p) => p.patternType === "podcast类型内容");
    expect(byContent).toBeDefined();
    expect(byContent?.frequency).toBe(3);
    // s1 出现 2 次入选，s2 只 1 次被过滤
    expect(byContent?.configurations.map((s) => s.id)).toEqual(["s1"]);
  });

  it("数据层抛错时返回空列表", async () => {
    mockHistoryFailure(new Error("boom"));
    await expect(service.detectRepetitivePatterns("u1")).resolves.toEqual([]);
  });
});

describe("usageAnalyticsService.getOptimizationSuggestions", () => {
  it("零记录用户得到「开始使用语音生成」引导", async () => {
    mockHistoryDocs(null);
    await expect(service.getOptimizationSuggestions("u1")).resolves.toEqual([
      {
        type: "workflow",
        title: "开始使用语音生成",
        description: expect.any(String),
        actionUrl: "/create",
        priority: "high",
      },
    ]);
  });

  it("重复模式转成 template 建议", async () => {
    mockHistoryDocs(generations(3, { style: { id: "s1", name: "温柔", emotionalTone: "calm" } }));
    const suggestions = await service.getOptimizationSuggestions("u1");
    expect(suggestions.filter((s) => s.type === "template").length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.priority === "high")).toBe(true);
    expect(suggestions.some((s) => s.actionUrl === "/templates/create")).toBe(true);
  });

  it("过半短文本→批量处理建议；风格分散→固定常用风格建议", async () => {
    mockHistoryDocs([
      makeGen({ id: "1", textLength: 10, style: { id: "s1" } }, 1),
      makeGen({ id: "2", textLength: 20, style: { id: "s2" } }, 2),
      makeGen({ id: "3", textLength: 30, style: { id: "s3" } }, 3),
      makeGen({ id: "4", textLength: 40, style: { id: "s4" } }, 4),
    ]);
    const titles = (await service.getOptimizationSuggestions("u1")).map((s) => s.title);
    expect(titles).toContain("批量处理短文本");
    expect(titles).toContain("固定常用风格");
  });

  it("超过 10 条且全部默认语速时提示调整语速", async () => {
    mockHistoryDocs(
      Array.from({ length: 11 }, (_unused, i) =>
        makeGen({ id: `g${i}`, textLength: 100, style: { id: `s-${i}`, speed: 1.0 } }, i),
      ),
    );
    const suggestions = await service.getOptimizationSuggestions("u1");
    const setting = suggestions.find((s) => s.type === "setting");
    expect(setting?.title).toBe("尝试调整语速");
    expect(setting?.priority).toBe("low");
    // 11 条各不相同的风格 → 触发「固定常用风格」，但不触发批量短文本
    expect(suggestions.some((s) => s.title === "固定常用风格")).toBe(true);
    expect(suggestions.some((s) => s.title === "批量处理短文本")).toBe(false);
  });

  it("恰好 10 条不推语速建议（必须 > 10）", async () => {
    mockHistoryDocs(
      Array.from({ length: 10 }, (_unused, i) => makeGen({ id: `g${i}`, style: { id: `s-${i}` } }, i)),
    );
    const suggestions = await service.getOptimizationSuggestions("u1");
    expect(suggestions.some((s) => s.type === "setting")).toBe(false);
  });

  it("数据层抛错时返回空建议", async () => {
    mockHistoryFailure(new Error("boom"));
    await expect(service.getOptimizationSuggestions("u1")).resolves.toEqual([]);
  });
});

describe("usageAnalyticsService 导出 / 解析往返", () => {
  const sample: GenerationRecord[] = [
    makeGen(
      {
        id: "g1",
        textLength: 80,
        contentType: "notice",
        language: "zh-CN",
        style: { id: "s1", name: "N1", speed: 0.9, emotionalTone: "calm" },
      },
      1,
    ),
    makeGen(
      {
        id: "g2",
        textLength: 120,
        contentType: "article",
        language: "en-US",
        style: { id: "s2", name: "N2", speed: 1.1, emotionalTone: "happy" },
      },
      2,
    ),
  ];

  it("json 导出可被 parseExportedData 还原，日期回升为 Date", async () => {
    mockHistoryDocs(sample);
    const text = await service.exportData("u1", "json");
    const parsed = JSON.parse(text);
    expect(typeof parsed.exportDate).toBe("string");

    const back = service.parseExportedData(text, "json");
    expect(back.userId).toBe("u1");
    expect(back.exportDate).toBeInstanceOf(Date);
    expect(back.statistics.totalGenerations).toBe(2);
    expect(back.rawData).toHaveLength(2);
    expect(back.rawData?.[0].timestamp).toBeInstanceOf(Date);
    expect(back.rawData?.[0].voiceStyle.name).toBe("N1");
  });

  it("csv 导出含元数据与表头，且能反向解析出记录", async () => {
    mockHistoryDocs(sample);
    const csv = await service.exportData("u1", "csv");
    expect(csv).toContain("# Analytics Export");
    expect(csv).toContain("# User ID: u1");
    expect(csv).toContain("Total Generations,2");
    expect(csv).toContain("Average Text Length,100");
    const header = "ID,Timestamp,TextLength,ContentType,Language,VoiceStyleId,VoiceStyleName,Speed,EmotionalTone";
    expect(csv).toContain(header);

    const back = service.parseExportedData(csv, "csv");
    expect(back.userId).toBe("u1");
    expect(back.exportDate).toBeInstanceOf(Date);
    expect(back.statistics.totalGenerations).toBe(2);
    expect(back.statistics.averageTextLength).toBe(100);
    expect(back.statistics.mostUsedLanguages).toEqual(
      expect.arrayContaining([{ language: "zh-CN", percentage: 50 }]),
    );
    expect(back.rawData).toHaveLength(2);
    expect(back.rawData?.[0]).toMatchObject({
      id: "g1",
      textLength: 80,
      contentType: "notice",
      language: "zh-CN",
      voiceStyle: { id: "s1", name: "N1", speed: 0.9, emotionalTone: "calm" },
    });
  });

  it("导出过程中数据层抛错转成统一失败信息", async () => {
    mockHistoryFailure(new Error("mongo down"));
    await expect(service.exportData("u1", "json")).rejects.toThrow("导出数据失败");
  });

  it("非法 JSON 抛带原因的解析错误", () => {
    expect(() => service.parseExportedData("{not json", "json")).toThrow(/Failed to parse exported data/);
  });

  it("缺 statistics 的 JSON 视为非法格式", () => {
    const bare = JSON.stringify({ userId: "u1", exportDate: new Date().toISOString() });
    expect(() => service.parseExportedData(bare, "json")).toThrow(/Invalid AnalyticsExport format/);
  });

  it("statistics 字段类型不符也判非法", () => {
    const bad = {
      userId: "u1",
      exportDate: new Date().toISOString(),
      statistics: {
        totalGenerations: "2",
        favoriteStyles: [],
        peakUsageTimes: [],
        averageTextLength: 0,
        mostUsedLanguages: [],
      },
      suggestions: [],
    };
    expect(() => service.parseExportedData(JSON.stringify(bad), "json")).toThrow(/Invalid AnalyticsExport format/);
  });

  it("只有注释的 CSV 解析成空骨架", () => {
    const back = service.parseExportedData("# Analytics Export\n# User ID: u9\n", "csv");
    expect(back.userId).toBe("u9");
    expect(back.statistics).toEqual({
      totalGenerations: 0,
      favoriteStyles: [],
      peakUsageTimes: [],
      averageTextLength: 0,
      mostUsedLanguages: [],
    });
    expect(back.rawData).toEqual([]);
    expect(back.suggestions).toEqual([]);
  });
});
