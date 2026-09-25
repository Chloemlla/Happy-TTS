/**
 * buildIpRiskDecision 是「记进库里的决策」与「真正回给前端的结论」的唯一产出点。
 * 这里把 action 映射与失败开关语义钉死：改判据必须同时改这些断言。
 *
 * 阈值 / failOpen 一律从决策自身读出再断言相对关系，不写死 66 或 true ——
 * 这个文件的职责是钉住规则，不是钉住某一版配置。
 */
import { ProxycheckLookupLogModel } from "../models/proxycheckLookupLogModel";
import { buildIpRiskDecision, type IpRiskCaller } from "../services/ipRiskService";
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
  const BELOW = Math.max(0, THRESHOLD - 1);

  it("上游给出高风险结论时，只有 api 是「只上报」，闸门与批量都挑战", () => {
    const high = verdict({ risk: 100, level: "critical" });

    for (const caller of ALL_CALLERS) {
      const decision = buildIpRiskDecision(high, caller);

      expect(decision.caller).toBe(caller);
      expect(decision.shouldChallenge).toBe(true);
      expect(decision.action).toBe(caller === "api" ? "report" : "challenge");
      expect(decision.reason).toBe("proxycheck_risk_critical");
      expect(decision.source).toBe("proxycheck");
      expect(decision.closedOnFailure).toBe(false);
      expect(decision.risk).toBe(100);
      expect(decision.level).toBe("critical");
      expect(decision.threshold).toBe(THRESHOLD);
    }
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
