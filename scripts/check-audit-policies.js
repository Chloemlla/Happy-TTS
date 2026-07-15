#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function walk(dir, predicate, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage" || entry.name === ".git") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, files);
    } else if (predicate(full)) {
      files.push(full);
    }
  }
  return files;
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

const findings = [];

// 1) Frontend must not dump auth secrets into console.*
const frontendFiles = walk(path.join(root, "frontend", "src"), (file) => /\.(ts|tsx|js|jsx)$/.test(file));
for (const file of frontendFiles) {
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!/console\.(log|warn|error|info|debug)\s*\(/.test(line)) return;

    const dumpsSecret =
      /Bearer\s+\$\{/.test(line) ||
      /Authorization[^\n]*\$\{/.test(line) ||
      /`Bearer\s+\$\{token\}`/.test(line) ||
      /localStorage\.getItem\(\s*['"]token['"]\s*\)/.test(line) ||
      /console\.(log|warn|error|info|debug)\([^\n]*\b(password|token|refreshToken|accessToken)\s*[,)]/.test(line) ||
      /console\.(log|warn|error|info|debug)\([^\n]*\{\s*[^\n]*\b(password|token|refreshToken|accessToken)\b/.test(line);

    // Allow status metadata and generic error labels that only mention the word password/token.
    const looksLikeLabelOnly =
      /password verification|password reset|token validation|authState|hasAuthToken|present|missing|length/i.test(line) &&
      !/Bearer\s+\$\{/.test(line) &&
      !/localStorage\.getItem\(\s*['"]token['"]\s*\)/.test(line);

    if (dumpsSecret && !looksLikeLabelOnly) {
      findings.push({
        rule: "no-token-console",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
}

// 2) Shared hardcoded signing secrets / default secret literals
const secretFiles = walk(path.join(root, "frontend", "src"), (file) => /\.(ts|tsx)$/.test(file)).concat(
  walk(path.join(root, "src"), (file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${path.sep}tests${path.sep}`)),
);
const hardcodedSecretRe =
  /(SECRET_KEY\s*=\s*["'`][^"'`]+["'`]|default-secret|VITE_SIGN_SECRET_KEY\s*\|\|\s*["'`])/i;
for (const file of secretFiles) {
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (hardcodedSecretRe.test(line) && !line.includes("createClientOnlyIntegrityKey")) {
      findings.push({
        rule: "no-hardcoded-signing-secret",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
}

// 3) LogShare must not log content previews
const logRoutes = path.join(root, "src", "routes", "logRoutes.ts");
if (fs.existsSync(logRoutes)) {
  const lines = read(logRoutes).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/contentPreview|content\.slice\s*\(/.test(line)) {
      findings.push({
        rule: "no-logshare-content-preview",
        file: path.relative(root, logRoutes),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
}

// 4) Workflow supply-chain hygiene
const workflowDir = path.join(root, ".github", "workflows");
const workflows = walk(workflowDir, (file) => file.endsWith(".yml") || file.endsWith(".yaml"));
for (const file of workflows) {
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/uses:\s*\S+@main\b/.test(line) || /uses:\s*\S+@master\b/.test(line)) {
      findings.push({
        rule: "no-mutable-action-ref",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim(),
      });
    }
    if (/node-version:\s*['"]?latest['"]?/.test(line) || /version:\s*['"]?latest['"]?/.test(line)) {
      findings.push({
        rule: "no-latest-toolchain",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim(),
      });
    }
    if (/--no-frozen-lockfile/.test(line)) {
      findings.push({
        rule: "no-unfrozen-lockfile",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim(),
      });
    }
  });
}

// 5) Frontend runtime dependency denylist
const frontendPkgPath = path.join(root, "frontend", "package.json");
const deny = [
  "@prisma/client",
  "bcrypt",
  "jsonwebtoken",
  "@simplewebauthn/server",
  "express-rate-limit",
  "form-data",
  "javascript-obfuscator",
  "mongoose",
  "mysql2",
  "sequelize",
];
if (fs.existsSync(frontendPkgPath)) {
  const pkg = JSON.parse(read(frontendPkgPath));
  const deps = pkg.dependencies || {};
  for (const name of deny) {
    if (deps[name]) {
      findings.push({
        rule: "frontend-no-server-deps",
        file: path.relative(root, frontendPkgPath),
        line: 1,
        detail: `runtime dependency not allowed: ${name}@${deps[name]}`,
      });
    }
  }
}

if (findings.length) {
  console.error("Audit policy check failed:");
  for (const finding of findings) {
    console.error(`- [${finding.rule}] ${finding.file}:${finding.line} ${finding.detail}`);
  }
  process.exit(1);
}

console.log("Audit policy check passed.");
