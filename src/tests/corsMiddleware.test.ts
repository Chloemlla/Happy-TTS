import { allowedOrigins, isOriginAllowed } from "../middleware/corsMiddleware";

describe("corsMiddleware origin allowlist", () => {
  it("allows the apex and the frontends served from its subdomains", () => {
    expect(isOriginAllowed("https://chloemlla.com")).toBe(true);
    // Vercel 副本的前端构建把 API base 定到 apex，属跨源调用，必须显式放行。
    expect(isOriginAllowed("https://synapse.chloemlla.com")).toBe(true);
  });

  it("rejects the retired tts.chloemlla.com origin", () => {
    // 该域已 NXDOMAIN、不再是任何前端的来源，保留在白名单里只会留一个假的信任位。
    expect(isOriginAllowed("https://tts.chloemlla.com")).toBe(false);
  });

  it("allows requests without an Origin header (curl / server-to-server)", () => {
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed("")).toBe(true);
  });

  it("rejects look-alike origins that only resemble an allowlisted host", () => {
    expect(isOriginAllowed("https://synapse.chloemlla.com.evil.example")).toBe(false);
    expect(isOriginAllowed("https://synapse-chloemlla.com")).toBe(false);
    expect(isOriginAllowed("http://synapse.chloemlla.com")).toBe(false);
    expect(isOriginAllowed("https://evil.example")).toBe(false);
  });

  it("keeps every allowlist entry wildcard-free", () => {
    expect(allowedOrigins.every((origin) => !origin.includes("*"))).toBe(true);
  });
});
