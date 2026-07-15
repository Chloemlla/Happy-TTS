/**
 * Static/regression assertions for auth token logging hygiene.
 * These tests intentionally inspect source text so CI fails if token console logs return.
 */
const fs = require("node:fs");
const path = require("node:path");

describe("auth token logging hygiene", () => {
  const useAuthPath = path.join(process.cwd(), "frontend", "src", "hooks", "useAuth.ts");

  it("does not console-log Bearer tokens or Authorization headers", () => {
    const source = fs.readFileSync(useAuthPath, "utf8");
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*Bearer/i);
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*Authorization/i);
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*\$\{token\}/);
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*token\)/);
  });
});
