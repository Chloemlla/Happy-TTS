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


describe("cookie-only browser login storage", () => {
  const useAuthPath = require("node:path").join(process.cwd(), "frontend", "src", "hooks", "useAuth.ts");
  const authSessionPath = require("node:path").join(process.cwd(), "frontend", "src", "utils", "authSession.ts");

  it("does not persist login access tokens in JS storage helpers for browser login", () => {
    const fs = require("node:fs");
    const useAuth = fs.readFileSync(useAuthPath, "utf8");
    const authSession = fs.readFileSync(authSessionPath, "utf8");
    // Browser login path should clear token storage rather than setAuthToken(loginToken)
    expect(useAuth).toMatch(/clearAuthToken\(\);\s*\n\s*saveAccount\(user, ''\)/);
    expect(authSession).toMatch(/Browser sessions are cookie-only|cookie-only/);
  });
});
