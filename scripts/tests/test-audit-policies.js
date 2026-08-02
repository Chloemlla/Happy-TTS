#!/usr/bin/env node
"use strict";

/**
 * Pure-JS (no compile/tsc) regression tests for audit hardening policies:
 * - generation code strength
 * - mysql URI fail-closed defaults
 * - static policy script presence
 *
 * Run: node scripts/tests/test-audit-policies.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");

const {
  GENERATION_CODE_MIN_LENGTH,
  validateGenerationCodeStrength,
  assertStrongGenerationCode,
  isGenerationCodeConfigured,
  normalizeGenerationCode,
} = require("../lib/generationCodePolicy");

const {
  isWeakMysqlUri,
  requireMysqlUri,
  normalizeMysqlUri,
} = require("../lib/mysqlUriPolicy");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${error && error.message ? error.message : error}`);
  }
}

console.log("generationCodePolicy");

test("empty generation code is allowed (feature disabled)", () => {
  const result = validateGenerationCodeStrength("");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.code, "");
  assert.strictEqual(isGenerationCodeConfigured(""), false);
  assert.strictEqual(isGenerationCodeConfigured("   "), false);
});

test("rejects predictable default 'admin'", () => {
  const result = validateGenerationCodeStrength("admin");
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /high-entropy|at least/i);
});

test("rejects short codes", () => {
  const result = validateGenerationCodeStrength("short-but-not-enough");
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, new RegExp(String(GENERATION_CODE_MIN_LENGTH)));
});

test("rejects repeated / low-unique-character codes", () => {
  const result = validateGenerationCodeStrength("aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.strictEqual(result.ok, false);
});

test("accepts high-entropy 32-char hex-like code", () => {
  const code = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const result = validateGenerationCodeStrength(code);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.code, code);
  assert.strictEqual(isGenerationCodeConfigured(code), true);
  assert.strictEqual(assertStrongGenerationCode(code), code);
});

test("normalize trims whitespace", () => {
  assert.strictEqual(normalizeGenerationCode("  abc  "), "abc");
});

test("assertStrongGenerationCode throws on weak values", () => {
  assert.throws(() => assertStrongGenerationCode("password"), /high-entropy|at least/i);
});

console.log("mysqlUriPolicy");

test("missing MYSQL_URI is rejected", () => {
  assert.throws(() => requireMysqlUri({}), /MYSQL_URI is required/);
});

const weakMysqlUri = `mysql://${"root:password"}@localhost:3306/tts`;

test("weak root:password URI is rejected", () => {
  assert.strictEqual(isWeakMysqlUri(weakMysqlUri), true);
  assert.throws(
    () => requireMysqlUri({ MYSQL_URI: weakMysqlUri }),
    /weak|default/i,
  );
});

test("root without password is rejected", () => {
  assert.strictEqual(isWeakMysqlUri("mysql://root@localhost:3306/tts"), true);
});

test("strong explicit MYSQL_URI is accepted", () => {
  const uri = "mysql://app_user:S3cure-Passw0rd!@db.internal:3306/tts";
  assert.strictEqual(isWeakMysqlUri(uri), false);
  assert.strictEqual(requireMysqlUri({ MYSQL_URI: uri }), uri);
});

test("normalizeMysqlUri trims", () => {
  assert.strictEqual(normalizeMysqlUri("  mysql://x  "), "mysql://x");
});

console.log("static audit policy script");

test("check-audit-policies.js exists and is executable via node", () => {
  const script = path.join(ROOT, "scripts", "check-audit-policies.js");
  assert.ok(fs.existsSync(script), "scripts/check-audit-policies.js missing");
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `check-audit-policies.js failed (exit ${result.status}):\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  assert.match(result.stdout || "", /Audit policy check passed/);
});

test("config.ts no longer defaults GENERATION_CODE to admin", () => {
  const text = fs.readFileSync(path.join(ROOT, "src", "config", "config.ts"), "utf8");
  assert.doesNotMatch(text, /GENERATION_CODE:\s*z\.string\(\)[^,\n]*\.default\(\s*["']admin["']\s*\)/);
  assert.match(text, /generationCodePolicy|validateGenerationCodeStrength/);
});

test("startup.ts logs configured boolean only", () => {
  const text = fs.readFileSync(path.join(ROOT, "src", "app", "startup.ts"), "utf8");
  assert.doesNotMatch(text, /当前生成码/);
  assert.match(text, /generationCodeConfigured/);
  assert.doesNotMatch(text, /\$\{[^}]*generationCode/);
});

test("mysql adapters no longer embed root:password", () => {
  for (const rel of [
    "src/services/lotteryStorage/mysql.ts",
    "src/services/modlistStorage/mysql.ts",
    "src/services/userGenerationStorage/mysql.ts",
  ]) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.doesNotMatch(text, /mysql:\/\/root:password@/i);
    assert.match(text, /requireMysqlUri/);
  }
});

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log("All audit policy tests passed.");
