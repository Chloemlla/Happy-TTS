import { ApiError } from "../services/lumen/errors";
import {
  DEFAULT_LIMIT,
  DEFAULT_REPORT_LIMIT,
  MAX_LIMIT,
  MAX_REPORT_LIMIT,
  MAX_SEARCH_LENGTH,
  buildGroupFilter,
  buildGroupSort,
  escapeRegex,
  parseGroupQuery,
  parseReportQuery,
} from "../routes/admin/crashReportQuery";

describe("crashReportQuery.parseGroupQuery", () => {
  it("在无参数时返回默认值", () => {
    expect(parseGroupQuery({})).toEqual({
      limit: DEFAULT_LIMIT,
      offset: 0,
      source: "",
      risk: "",
      versionCode: null,
      search: "",
      sort: "lastSeenAt",
      order: -1,
    });
  });

  it("把 limit 与 offset 夹紧到合法区间", () => {
    expect(parseGroupQuery({ limit: "1000" }).limit).toBe(MAX_LIMIT);
    expect(parseGroupQuery({ limit: "0" }).limit).toBe(1);
    expect(parseGroupQuery({ offset: "-50" }).offset).toBe(0);
    expect(parseGroupQuery({ offset: "12.9" }).offset).toBe(12);
  });

  it("接受合法的筛选与排序参数", () => {
    const parsed = parseGroupQuery({
      source: "SDK",
      risk: "High",
      versionCode: "1042",
      sort: "count",
      order: "asc",
      search: "  NullPointer  ",
    });
    expect(parsed.source).toBe("sdk");
    expect(parsed.risk).toBe("high");
    expect(parsed.versionCode).toBe(1042);
    expect(parsed.sort).toBe("count");
    expect(parsed.order).toBe(1);
    expect(parsed.search).toBe("NullPointer");
  });

  it("截断过长的搜索词", () => {
    const parsed = parseGroupQuery({ search: "x".repeat(MAX_SEARCH_LENGTH + 40) });
    expect(parsed.search).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("拒绝非法枚举值与非数字参数", () => {
    expect(() => parseGroupQuery({ source: "web" })).toThrow(ApiError);
    expect(() => parseGroupQuery({ risk: "critical" })).toThrow(ApiError);
    expect(() => parseGroupQuery({ sort: "unknown" })).toThrow(ApiError);
    expect(() => parseGroupQuery({ order: "sideways" })).toThrow(ApiError);
    expect(() => parseGroupQuery({ limit: "abc" })).toThrow(ApiError);
    expect(() => parseGroupQuery({ versionCode: "abc" })).toThrow(ApiError);
  });

  it("非法参数抛出 400", () => {
    try {
      parseGroupQuery({ source: "web" });
      throw new Error("expected parseGroupQuery to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
    }
  });
});

describe("crashReportQuery.parseReportQuery", () => {
  it("返回默认分页并夹紧上限", () => {
    expect(parseReportQuery({})).toEqual({ limit: DEFAULT_REPORT_LIMIT, offset: 0 });
    expect(parseReportQuery({ limit: "9999" }).limit).toBe(MAX_REPORT_LIMIT);
    expect(parseReportQuery({ offset: "40" }).offset).toBe(40);
  });
});

describe("crashReportQuery.escapeRegex", () => {
  it("转义正则元字符", () => {
    expect(escapeRegex("a.b*c+d?")).toBe("a\\.b\\*c\\+d\\?");
    expect(new RegExp(escapeRegex("a.c")).test("abc")).toBe(false);
    expect(new RegExp(escapeRegex("a.c")).test("a.c")).toBe(true);
  });
});

describe("crashReportQuery.buildGroupFilter", () => {
  it("无筛选时返回空过滤器", () => {
    expect(buildGroupFilter(parseGroupQuery({}))).toEqual({});
  });

  it("组合 groupKey 集合、风险与版本号", () => {
    const filter = buildGroupFilter(parseGroupQuery({ risk: "medium", versionCode: "7" }), ["a", "b"]);
    expect(filter).toEqual({
      groupKey: { $in: ["a", "b"] },
      risk: "medium",
      versionCode: 7,
    });
  });

  it("把搜索词编译为已转义的 $or 正则", () => {
    const filter = buildGroupFilter(parseGroupQuery({ search: "Foo.Bar" })) as {
      $or: Array<{ groupKey?: RegExp; cleanStack?: RegExp }>;
    };
    expect(filter.$or).toHaveLength(2);
    expect(filter.$or[0].groupKey?.source).toBe("Foo\\.Bar");
    expect(filter.$or[0].groupKey?.flags).toBe("i");
    expect(filter.$or[1].cleanStack?.source).toBe("Foo\\.Bar");
  });
});

describe("crashReportQuery.buildGroupSort", () => {
  it("按风险排序时使用数值权重字段", () => {
    expect(buildGroupSort(parseGroupQuery({ sort: "risk" }))).toEqual({
      riskWeight: -1,
      lastSeenAt: -1,
    });
    expect(buildGroupSort(parseGroupQuery({ sort: "risk", order: "asc" }))).toEqual({
      riskWeight: 1,
      lastSeenAt: -1,
    });
  });

  it("按时间排序时不追加冗余的次级键", () => {
    expect(buildGroupSort(parseGroupQuery({ sort: "lastSeenAt", order: "asc" }))).toEqual({
      lastSeenAt: 1,
    });
  });

  it("其他字段追加 lastSeenAt 作为稳定次级键", () => {
    expect(buildGroupSort(parseGroupQuery({ sort: "count" }))).toEqual({
      count: -1,
      lastSeenAt: -1,
    });
    expect(buildGroupSort(parseGroupQuery({ sort: "affectedUsers", order: "asc" }))).toEqual({
      affectedUsers: 1,
      lastSeenAt: -1,
    });
  });
});
