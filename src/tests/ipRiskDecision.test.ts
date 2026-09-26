/**
 * buildIpRiskDecision 是「记进库里的决策」与「真正回给前端的结论」的唯一产出点。
 * 这里把 action 映射与失败开关语义钉死：改判据必须同时改这些断言。
 *
 * 阈值 / failOpen 一律从决策自身读出再断言相对关系，不写死 66 或 true ——
 * 这个文件的职责是钉住规则，不是钉住某一版配置。
 */
import { ProxycheckLookupLogModel } from "../models/proxycheckLookupLogModel";
import { buildIpRiskDecision, type IpRiskCaller } from "../services/ipRiskService";
import { LOOKUP_STATUSES, parseLookupQuery } from "../services/proxycheckLogQuery";
import { unavailableResult, type IpRiskDetections, type IpRiskResult } from "../services/proxycheckParsing";

const IP = "203.0.113.7";
const ALL_CALLERS: IpRiskCaller[] = ["api", "first_visit_gate", "batch"];
const CHALLENGE_FLAGS = ["vpn", "proxy", "tor"] as const;
const FLAG_DETECTION: Record<(typeof CHALLENGE_FLAGS)[number], Partial<IpRiskDetections>> = {
  vpn: { vpn: true },
  proxy: { proxy: true },
  tor: { tor: true },
};

function detections(overrides: Partial<IpRiskDetections> = {}): IpRiskDetections {
  return { ...unavailableResult(IP).detections, ...overrides };
}

/** 上游确实给出了结论的结果（source !== "unavailable"）。 */
function verdict(overrides: Partial<IpRiskResult> = {}): IpRiskResult {
  return { ...unavailableResult(IP), source: "proxycheck", ...overrides };
}

describe("buildIpRiskDecision", () => {
  const THRESHOLD = buildIpRiskDecision(verdict(), "api").threshold;
  const BLOCK_THRESHOLD = buildIpRiskDecision(verdict(), "api").blockThreshold;
  const BELOW = Math.max(0, THRESHOLD - 1);

  it("上游给出满分风险时：api 只上报；闸门达到阻断阈值就直接阻断，否则才挑战；批量只挑战", () => {
    const high = verdict({ risk: 100, level: "critical" });
    const gateBlocks = 100 >= BLOCK_THRESHOLD;

    for (const caller of ALL_CALLERS) {
      const decision = buildIpRiskDecision(high, caller);
      const expectedAction =
        caller === "api" ? "report" : caller === "first_visit_gate" && gateBlocks ? "block" : "challenge";

      expect(decision.caller).toBe(caller);
      expect(decision.shouldChallenge).toBe(true);
      expect(decision.shouldBlock).toBe(caller === "first_visit_gate" && gateBlocks);
      expect(decision.action).toBe(expectedAction);
      expect(decision.reason).toBe("proxycheck_risk_critical");
      expect(decision.source).toBe("proxycheck");
      expect(decision.closedOnFailure).toBe(false);
      expect(decision.risk).toBe(100);
      expect(decision.level).toBe("critical");
      expect(decision.threshold).toBe(THRESHOLD);
      expect(decision.blockThreshold).toBe(BLOCK_THRESHOLD);
    }
  });

  it("阻断只由首访闸门产出：api / batch 超过阻断阈值也不 block（查询路径不替调用方封 IP）", () => {
    const overBlock = verdict({ risk: 100, level: "critical" });

    expect(buildIpRiskDecision(overBlock, "api").shouldBlock).toBe(false);
    expect(buildIpRiskDecision(overBlock, "api").action).toBe("report");
    expect(buildIpRiskDecision(overBlock, "batch").shouldBlock).toBe(false);
  });

  it("风险分低于阻断阈值时闸门不阻断（退回挑战或放行）", () => {
    const belowBlock = verdict({ risk: Math.max(0, BLOCK_THRESHOLD - 1), level: "high" });
    const decision = buildIpRiskDecision(belowBlock, "first_visit_gate");

    if (BLOCK_THRESHOLD > 0) {
      expect(decision.shouldBlock).toBe(false);
    }
    expect(decision.action).toBe(decision.shouldChallenge ? "challenge" : "allow");
  });

  it("分数低于阈值且没命中 flag 时不挑战，api 依旧只上报", () => {
    const low = verdict({ risk: BELOW, level: "low" });

    expect(buildIpRiskDecision(low, "api").shouldChallenge).toBe(BELOW >= THRESHOLD);
    expect(buildIpRiskDecision(low, "api").action).toBe("report");
    expect(buildIpRiskDecision(low, "first_visit_gate").action).toBe(
      BELOW >= THRESHOLD ? "challenge" : "allow",
    );
  });

  it("vpn / proxy / tor 任一命中即挑战，即使分数低于阈值", () => {
    for (const flag of CHALLENGE_FLAGS) {
      const result = verdict({
        risk: BELOW,
        level: "low",
        detections: detections(FLAG_DETECTION[flag]),
        flags: [flag],
      });

      expect(buildIpRiskDecision(result, "first_visit_gate").shouldChallenge).toBe(true);
      expect(buildIpRiskDecision(result, "api").shouldChallenge).toBe(true);
    }
  });

  it("hosting 单独命中不触发挑战（机房出口太常见，只体现在分数里）", () => {
    const hosting = verdict({
      risk: BELOW,
      level: "low",
      detections: detections({ hosting: true }),
      flags: ["hosting"],
    });

    expect(buildIpRiskDecision(hosting, "first_visit_gate").shouldChallenge).toBe(BELOW >= THRESHOLD);
  });

  it("拿不到结论时按 failOpen 决定失败开关，与 caller 无关", () => {
    const missing = unavailableResult(IP);

    for (const caller of ALL_CALLERS) {
      const decision = buildIpRiskDecision(missing, caller);

      expect(decision.source).toBe("unavailable");
      expect(decision.reason).toBe("proxycheck_unavailable");
      expect(decision.risk).toBe(0);
      expect(decision.closedOnFailure).toBe(!decision.failOpen);
      expect(decision.shouldChallenge).toBe(decision.closedOnFailure);
      expect(decision.action).toBe(decision.failOpen ? "fail_open" : "fail_closed");
    }
  });

  it("把当时的生效值一并记下：阈值与 failOpen 进决策，事后才解释得清", () => {
    const decision = buildIpRiskDecision(verdict({ risk: 100, level: "high" }), "batch");

    expect(typeof decision.threshold).toBe("number");
    expect(typeof decision.blockThreshold).toBe("number");
    expect(typeof decision.failOpen).toBe("boolean");
    expect(decision.flags).toEqual([]);
  });
});

describe("proxycheck_lookup_logs 的 decision 子文档", () => {
  const base = {
    ip: IP,
    apiKeyHash: "hash",
    apiKeySlot: 0,
    status: "ok",
    ok: true,
    deduped: false,
    durationMs: 12,
    error: "",
  };

  it("改动前写下的旧行（没有 decision）照样通过校验，且不凭空生成空子文档", () => {
    const doc = new ProxycheckLookupLogModel(base);

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.decision).toBeUndefined();
  });

  it("带 decision 的行原样落库", () => {
    const decision = buildIpRiskDecision(verdict({ risk: 90, level: "high" }), "api");
    const doc = new ProxycheckLookupLogModel({ ...base, decision });

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.decision?.action).toBe("report");
    expect(doc.decision?.caller).toBe("api");
    expect(doc.decision?.threshold).toBe(decision.threshold);
    expect(doc.decision?.level).toBe("high");
  });
});

/**
 * 命中缓存的判定必须自带一行「已走缓存」的决策日志。
 *
 * 钉住这条是因为老行为会误判：只有真的外呼才落行，于是上游持续失败时整张表只剩
 * status=failed，管理面板读起来就是「闸门一直在上游失败」，而当时绝大多数判定其实是
 * 缓存里那份结论给的（零外呼、零配额）。记录方式必须能把两者区分开。
 */
describe("命中缓存的决策日志", () => {
  // 取「高于挑战阈值、低于阻断阈值」的分数：这一组用例要测的是缓存结论仍被判为挑战。
  const BLOCK_THRESHOLD = buildIpRiskDecision(verdict(), "api").blockThreshold;
  const CACHE_RISK = Math.max(0, BLOCK_THRESHOLD - 1);

  const cachedResult = (): IpRiskResult => ({
    ...unavailableResult(IP),
    source: "cache",
    cached: true,
    risk: CACHE_RISK,
    level: "high",
  });

  it("决策快照把 source 记成 cache，且按闸门 caller 正常判挑战（缓存结论照样能拦人）", () => {
    const decision = buildIpRiskDecision(cachedResult(), "first_visit_gate");

    expect(decision.source).toBe("cache");
    expect(decision.shouldChallenge).toBe(decision.risk >= decision.threshold);
    expect(decision.action).toBe(decision.shouldChallenge ? "challenge" : "allow");
    // 拿得到了结论 = 不是失败降级路径，failOpen / closedOnFailure 都不该参与。
    expect(decision.reason).toBe("proxycheck_risk_high");
    expect(decision.closedOnFailure).toBe(false);
  });

  it("cache 是合法的 status 取值，服务端筛选认它（否则面板无法只看走缓存的行）", () => {
    expect(LOOKUP_STATUSES).toContain("cache");
    expect(parseLookupQuery({ status: "cache" }).status).toBe("cache");
  });

  it("status=cache 的行能落库，且不要求 error", () => {
    const doc = new ProxycheckLookupLogModel({
      ip: IP,
      apiKeySlot: 0,
      // 命中缓存不消耗配额、没动任何 key：apiKeyHash 记成 "cache" 哨兵，不借用真 key 的哈希。
      apiKeyHash: "cache",
      status: "cache",
      ok: true,
      risk: CACHE_RISK,
      deduped: false,
      durationMs: 1,
      error: "",
      decision: buildIpRiskDecision(cachedResult(), "first_visit_gate"),
    });

    expect(doc.validateSync()).toBeUndefined();
    expect(doc.decision?.source).toBe("cache");
  });
});
