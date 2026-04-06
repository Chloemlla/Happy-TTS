import {
  buildScamalyticsLookupUrl,
  normalizeScamalyticsUser,
  validateScamalyticsUser,
} from "../utils/scamalytics";

describe("scamalytics URL safety helpers", () => {
  it("keeps valid usernames unchanged", () => {
    expect(normalizeScamalyticsUser("happy.clovo_01")).toBe(
      "happy.clovo_01",
    );
  });

  it("falls back to the safe default for invalid usernames", () => {
    expect(normalizeScamalyticsUser("../../169.254.169.254")).toBe(
      "happyclovo",
    );
  });

  it("rejects invalid usernames at validation time", () => {
    expect(() => validateScamalyticsUser("../../etc/passwd")).toThrow(
      "Scamalytics 用户名仅允许字母、数字、点、下划线和连字符",
    );
  });

  it("builds a fixed-host lookup URL", () => {
    expect(buildScamalyticsLookupUrl("happyclovo")).toBe(
      "https://api13.scamalytics.com/v3/happyclovo/",
    );
  });
});
