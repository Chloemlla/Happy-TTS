import { isServerStatusPasswordValid } from "../services/operationalStatusService";

describe("operationalStatusService", () => {
  it("accepts the configured server status password", () => {
    expect(isServerStatusPasswordValid("test-password")).toBe(true);
  });

  it("rejects invalid server status passwords", () => {
    expect(isServerStatusPasswordValid("wrong-password")).toBe(false);
    expect(isServerStatusPasswordValid("test-password ")).toBe(false);
    expect(isServerStatusPasswordValid(undefined)).toBe(false);
  });

  it("rejects oversized password candidates", () => {
    expect(isServerStatusPasswordValid("a".repeat(1025))).toBe(false);
  });
});
