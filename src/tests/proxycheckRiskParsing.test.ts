/**
 * proxycheck 的 risk 分解析。钉住线上真实踩过的那个洞：
 *
 * 某些节点不把 risk 放在响应顶层，而是连同 confidence / first_seen 一起塞在 detections 对象里。
 * 旧实现只读顶层 raw.risk，形状不对时 toScore 静默回退 0 —— 于是 risk=100 的机房 VPN 地址
 * 被落库成 risk=0、level=low，面板上「上游给出了低风险结论」，而 detectionsRaw 里明明写着 100。
 * 更糟的是判定本身：risk 不足以过阈值时只剩 vpn/proxy/tor 三个标志兜底，
 * 一个只中了 hosting/compromised 的高风险地址会被首访闸门直接放行。
 */
import type { ProxycheckRiskCacheDoc } from "../models/proxycheckRiskCacheModel";
import { buildIpRiskDecision } from "../services/ipRiskService";
import {
  docToParsed,
  parseV3Result,
  resolveRiskScore,
  toRiskResult,
} from "../services/proxycheckParsing";

const IP = "203.10.99.12";
const QUERIED_AT = new Date("2026-09-25T13:58:35.396Z");

/** 线上 203.10.99.12 那次的形状：顶层没有 risk，分数只在 detections 里。 */
const DETECTIONS_ONLY = {
  detections: {
    proxy: false,
    vpn: true,
    compromised: true,
    scraper: false,
    tor: false,
    hosting: true,
    anonymous: true,
    risk: 100,
    confidence: 93,
    first_seen: "2026-08-28T02:57:58Z",
    last_seen: "2026-09-25T03:31:11Z",
    times_seen: 43,
  },
  network: {
    type: "Hosting",
    provider: "GSL Networks Pty LTD",
    organisation: "GSL Networks Pty LTD",
    asn: "AS137409",
    range: "203.10.99.0/23",
  },
  location: { timezone: "Asia/Tokyo", latitude: 35.6764, longitude: 139.65 },
  last_updated: "2026-09-25T03:31:11.000Z",
};

describe("resolveRiskScore", () => {
  it("顶层数字、数字字符串、{number} 对象这三类形状都读得出来", () => {
    expect(resolveRiskScore({ risk: 77 })).toBe(77);
    expect(resolveRiskScore({ risk: "77" })).toBe(77);
    expect(resolveRiskScore({ risk: { number: 77, description: "Very High Risk" } })).toBe(77);
  });

  it("顶层没有可用数字时，回落到 detections / security 里的分数", () => {
    expect(resolveRiskScore(DETECTIONS_ONLY)).toBe(100);
    expect(resolveRiskScore({ security: { risk: 66 } })).toBe(66);
  });

  it("多处同时给分时取最大值：读不到这种情形绝不允许塌成 0 分低风险", () => {
    expect(resolveRiskScore({ risk: 20, detections: { risk: 100 } })).toBe(100);
    expect(resolveRiskScore({ risk: null, detections: { risk: "88" } })).toBe(88);
  });

  it("真的哪儿都没有才是 0，越界值夹回 0..100", () => {
    expect(resolveRiskScore({})).toBe(0);
    expect(resolveRiskScore(undefined)).toBe(0);
    expect(resolveRiskScore({ risk: 160 })).toBe(100);
  });

  it("容器是 security（v2/部分节点）时也读得到分数", () => {
    expect(resolveRiskScore({ security: { risk: { number: 92, description: "High" } } })).toBe(92);
  });
});

describe("parseV3Result 的 risk 与 level", () => {
  it("detections-only 形状下不再一起塌成 risk=0 / level=low", () => {
    const parsed = parseV3Result(IP, DETECTIONS_ONLY, QUERIED_AT);

    expect(parsed.risk).toBe(100);
    expect(parsed.level).toBe("critical");
    expect(parsed.detections.vpn).toBe(true);
    expect(parsed.detections.confidence).toBe(93);
    expect(parsed.flags).toEqual(["anonymous", "vpn", "hosting", "compromised"]);
  });

  it("检测项摊在顶层（v2 风格，没有容器）时也不丢失标志", () => {
    const parsed = parseV3Result(
      IP,
      { vpn: "yes", proxy: false, hosting: "no", risk: 70, confidence: 80 },
      QUERIED_AT,
    );

    expect(parsed.detections.vpn).toBe(true);
    expect(parsed.flags).toEqual(["vpn"]);
    expect(parsed.risk).toBe(70);
    // 没容器时只存认识的那几个字段，不把整块响应当 detectionsRaw 存下去。
    expect(parsed.detectionsRaw).toEqual({ vpn: "yes", proxy: false, hosting: "no", risk: 70, confidence: 80 });
  });

  it("risk=100 且没中 vpn/proxy/tor 时，闸门照样必须要求验证（旧实现会放行）", () => {
    const parsed = parseV3Result(
      IP,
      {
        ...DETECTIONS_ONLY,
        detections: { ...DETECTIONS_ONLY.detections, vpn: false, proxy: false, tor: false },
      },
      QUERIED_AT,
    );
    const decision = buildIpRiskDecision(toRiskResult(parsed, false, "proxycheck"), "first_visit_gate");

    expect(decision.risk).toBe(100);
    expect(decision.level).toBe("critical");
    // 阈值可配，这里只钉相对关系：100 分必然不低于被夹到 0..100 的阈值。
    expect(decision.risk).toBeGreaterThanOrEqual(decision.threshold);
    expect(decision.shouldChallenge).toBe(true);
    expect(decision.action).toBe("challenge");
    expect(decision.reason).toBe("proxycheck_risk_critical");
  });
});

describe("docToParsed 对旧脏数据的自愈", () => {
  const cacheDoc = (overrides: Partial<ProxycheckRiskCacheDoc>): ProxycheckRiskCacheDoc =>
    ({
      ip: IP,
      confidence: 93,
      vpn: true,
      proxy: false,
      tor: false,
      hosting: true,
      anonymous: true,
      scraper: false,
      compromised: true,
      networkType: "Hosting",
      provider: "GSL Networks Pty LTD",
      organisation: "GSL Networks Pty LTD",
      asn: "AS137409",
      range: "203.10.99.0/23",
      hostname: "",
      continent: "",
      country: "",
      isocode: "",
      region: "",
      city: "",
      latitude: 35.6764,
      longitude: 139.65,
      timezone: "Asia/Tokyo",
      detectionsRaw: DETECTIONS_ONLY.detections,
      lastUpdated: new Date("2026-09-25T03:31:11.000Z"),
      queriedAt: QUERIED_AT,
      expiresAt: new Date("2026-09-26T13:58:35.396Z"),
      source: "proxycheck",
      ...overrides,
    }) as ProxycheckRiskCacheDoc;

  it("库里 risk 被旧解析写成 0 时，按 detectionsRaw 里的真分重算", () => {
    const parsed = docToParsed(cacheDoc({ risk: 0 }));

    expect(parsed.risk).toBe(100);
    expect(parsed.level).toBe("critical");
  });

  it("库里分数更高时不被 detectionsRaw 拉低（同一份数据读一次一个分）", () => {
    const parsed = docToParsed(
      cacheDoc({ risk: 100, detectionsRaw: { ...DETECTIONS_ONLY.detections, risk: 20 } }),
    );

    expect(parsed.risk).toBe(100);
  });

  it("干净地址（两处都是 0）不会被自愈凭空抬分", () => {
    const parsed = docToParsed(cacheDoc({ risk: 0, detectionsRaw: { vpn: false, risk: 0 } }));

    expect(parsed.risk).toBe(0);
    expect(parsed.level).toBe("low");
  });
});
