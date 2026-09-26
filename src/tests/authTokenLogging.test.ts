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
    // Only flag actual token material / header dumps, not natural-language mentions.
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*Bearer\s+\$\{/i);
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*Authorization\s*[:=]/i);
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*\$\{token\}/);
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug)\([^\n]*\btoken\s*\)/);
  });
});


describe("cookie-only browser login storage", () => {
  const useAuthPath = require("node:path").join(process.cwd(), "frontend", "src", "hooks", "useAuth.ts");
  const authSessionPath = require("node:path").join(process.cwd(), "frontend", "src", "utils", "authSession.ts");

  it("does not persist login access tokens in JS storage helpers for browser login", () => {
    const fs = require("node:fs");
    const useAuth = fs.readFileSync(useAuthPath, "utf8");
    const authSession = fs.readFileSync(authSessionPath, "utf8");

    // 旧断言钉的是调用点形状：`clearAuthToken();\n saveAccount(user, '')`。
    // 那个形状在 useAuth 重构给 Zustand 后就没了，于是 CI 只会在“改了代码形状”时红，
    // 而在“真的把 token 写进存储”时未必红 —— 保护不了任何东西（方法论 §五-11）。
    // 现在钉真正的不变量：落盘的唯一出口 writeSavedAccounts 必须把 token 剥掉。
    const writerBody = authSession.slice(
      authSession.indexOf("export function writeSavedAccounts"),
      authSession.indexOf("export function clearSavedAccounts"),
    );
    expect(writerBody).toBeTruthy();
    expect(writerBody).toMatch(/setItem\(ACCOUNTS_KEY/);
    expect(writerBody).not.toMatch(/\btoken\b/);

    // useAuth 里也不允许存在“直接把 token 写迥 storage”的路径。
    expect(useAuth).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*token/i);
    // 浏览器登录分支仍然得声明自己是 cookie-only（不靠 JS 存令牌）。
    expect(useAuth).toMatch(/HttpOnly-cookie only|cookie-only/i);
    expect(authSession).toMatch(/Browser sessions are cookie-only|identity metadata only|cookie-only/);
  });
});