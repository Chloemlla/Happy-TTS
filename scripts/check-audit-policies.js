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
const pinnedActionRe = /uses:\s*[^\s@]+@[0-9a-f]{40}\b/i;
const mutableTagRe = /uses:\s*\S+@(main|master|latest)\b/i;
const floatingTagRe = /uses:\s*[^\s@]+@(?![0-9a-f]{40}\b)[A-Za-z0-9._/-]+/i;
const userPatWriteRe = /secrets\.USER_PAT/;

for (const file of workflows) {
  const relative = path.relative(root, file);
  const content = read(file);
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    if (mutableTagRe.test(line) || /uses:\s*\S+@stable\b/.test(line)) {
      findings.push({
        rule: "no-mutable-action-ref",
        file: relative,
        line: idx + 1,
        detail: trimmed,
      });
    }

    if (/^\s*-\s*uses:/.test(line) || /^\s*uses:/.test(line)) {
      if (floatingTagRe.test(line) && !pinnedActionRe.test(line)) {
        findings.push({
          rule: "require-pinned-action-sha",
          file: relative,
          line: idx + 1,
          detail: trimmed,
        });
      }
    }

    if (/node-version:\s*['"]?latest['"]?/.test(line) || /(?:^|\s)version:\s*['"]?latest['"]?/.test(line)) {
      findings.push({
        rule: "no-latest-toolchain",
        file: relative,
        line: idx + 1,
        detail: trimmed,
      });
    }

    if (/--no-frozen-lockfile/.test(line)) {
      findings.push({
        rule: "no-unfrozen-lockfile",
        file: relative,
        line: idx + 1,
        detail: trimmed,
      });
    }

    if (/(^|[^A-Za-z0-9_-])force-merge([^A-Za-z0-9_-]|$)/.test(line) && !/intentionally disabled|unsupported action/i.test(line)) {
      findings.push({
        rule: "no-force-merge-action",
        file: relative,
        line: idx + 1,
        detail: trimmed,
      });
    }
  });

  // USER_PAT may only appear as optional read-only Dependabot alert access.
  if (userPatWriteRe.test(content)) {
    const allowedFile = relative.replace(/\\/g, "/") === ".github/workflows/dependabot-maintenance.yml";
    const hasReadOnlyComment = /USER_PAT is optional read-only access for Dependabot alerts only/i.test(content);
    if (!allowedFile || !hasReadOnlyComment) {
      findings.push({
        rule: "minimize-user-pat",
        file: relative,
        line: 1,
        detail: "USER_PAT must only be used as optional read-only Dependabot alerts access in dependabot-maintenance.yml",
      });
    }
  }
}

// 5) Auto-merge script must enforce head SHA, required checks, and approvals
const autoMergePath = path.join(root, "scripts", "auto-merge.js");
if (!fs.existsSync(autoMergePath)) {
  findings.push({
    rule: "auto-merge-script-present",
    file: "scripts/auto-merge.js",
    line: 1,
    detail: "scripts/auto-merge.js is required for hardened auto-merge",
  });
} else {
  const autoMerge = read(autoMergePath);
  const requiredSnippets = [
    ["normalizeSha", "head SHA normalization"],
    ["sha:", "merge API sha binding"],
    ["required_status_checks", "required checks from repository rules"],
    ["APPROVED", "approval state"],
    ["automerge", "automerge label gate"],
    ["mergeStateStatus", "repository merge state"],
  ];
  for (const [snippet, label] of requiredSnippets) {
    if (!autoMerge.includes(snippet)) {
      findings.push({
        rule: "auto-merge-hardening",
        file: "scripts/auto-merge.js",
        line: 1,
        detail: `missing ${label} (${snippet})`,
      });
    }
  }
}

// 6) Rust toolchain must be pinned
const rustToolchainPath = path.join(root, "rust-toolchain.toml");
if (!fs.existsSync(rustToolchainPath)) {
  findings.push({
    rule: "rust-toolchain-pinned",
    file: "rust-toolchain.toml",
    line: 1,
    detail: "rust-toolchain.toml is required",
  });
} else {
  const toolchain = read(rustToolchainPath);
  if (!/channel\s*=\s*["']1\.89\.0["']/.test(toolchain)) {
    findings.push({
      rule: "rust-toolchain-pinned",
      file: "rust-toolchain.toml",
      line: 1,
      detail: "channel must be pinned to 1.89.0",
    });
  }
}

// 7) Frontend runtime dependency denylist
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

// 8) force-merge helper must not remain in scripts/
const forceMergePath = path.join(root, "scripts", "force-merge-dependabot.js");
if (fs.existsSync(forceMergePath)) {
  findings.push({
    rule: "no-force-merge-script",
    file: "scripts/force-merge-dependabot.js",
    line: 1,
    detail: "force-merge helper bypasses approval/required-check policy",
  });
}

// 6) GENERATION_CODE must never default to a predictable value and must enforce strength policy.
const configTs = path.join(root, "src", "config", "config.ts");
if (fs.existsSync(configTs)) {
  const text = read(configTs);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/GENERATION_CODE\s*:\s*z\.string\(\)[^,\n]*\.default\(\s*["'`]admin["'`]\s*\)/.test(line)) {
      findings.push({
        rule: "no-weak-generation-code-default",
        file: path.relative(root, configTs),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
    if (/GENERATION_CODE\s*=\s*["'`]admin["'`]/.test(line)) {
      findings.push({
        rule: "no-weak-generation-code-default",
        file: path.relative(root, configTs),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
  if (!/generationCodePolicy|validateGenerationCodeStrength/.test(text)) {
    findings.push({
      rule: "generation-code-strength-enforced",
      file: path.relative(root, configTs),
      line: 1,
      detail: "config.ts must enforce generation-code strength via generationCodePolicy",
    });
  }
}

const generationCodePolicyTs = path.join(root, "src", "utils", "generationCodePolicy.ts");
if (!fs.existsSync(generationCodePolicyTs)) {
  findings.push({
    rule: "generation-code-strength-enforced",
    file: "src/utils/generationCodePolicy.ts",
    line: 1,
    detail: "missing generationCodePolicy utility",
  });
} else {
  const policyText = read(generationCodePolicyTs);
  if (!/GENERATION_CODE_MIN_LENGTH\s*=\s*24/.test(policyText)) {
    findings.push({
      rule: "generation-code-strength-enforced",
      file: path.relative(root, generationCodePolicyTs),
      line: 1,
      detail: "GENERATION_CODE_MIN_LENGTH must be 24",
    });
  }
}

// 7) Startup logs must never emit the generation-code value — only a configured boolean.
const startupTs = path.join(root, "src", "app", "startup.ts");
if (fs.existsSync(startupTs)) {
  const text = read(startupTs);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/当前生成码/.test(line) || /\$\{[^}]*generationCode/.test(line)) {
      findings.push({
        rule: "no-generation-code-logging",
        file: path.relative(root, startupTs),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
  if (!/generationCodeConfigured/.test(text)) {
    findings.push({
      rule: "no-generation-code-logging",
      file: path.relative(root, startupTs),
      line: 1,
      detail: "startup must log generationCodeConfigured boolean only",
    });
  }
}

// Broader scan: never log generation code values from src (excluding tests).
const backendSrcFiles = walk(
  path.join(root, "src"),
  (file) => /\.(ts|tsx|js)$/.test(file) && !file.includes(`${path.sep}tests${path.sep}`),
);
for (const file of backendSrcFiles) {
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!/logger\.(info|warn|error|debug|verbose)\s*\(/.test(line) && !/console\.(log|info|warn|error|debug)\s*\(/.test(line)) {
      return;
    }
    if (/当前生成码/.test(line) || /\$\{[^}]*generationCode/.test(line)) {
      findings.push({
        rule: "no-generation-code-logging",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
}

// 8) MySQL adapters must not ship weak root:password defaults; enabling mysql requires MYSQL_URI.
const mysqlAdapterFiles = [
  path.join(root, "src", "services", "lotteryStorage", "mysql.ts"),
  path.join(root, "src", "services", "modlistStorage", "mysql.ts"),
  path.join(root, "src", "services", "userGenerationStorage", "mysql.ts"),
];
for (const file of mysqlAdapterFiles) {
  if (!fs.existsSync(file)) continue;
  const text = read(file);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/mysql:\/\/root:password@/i.test(line) && !line.trim().startsWith("//") && !line.includes("reject")) {
      findings.push({
        rule: "no-weak-mysql-uri-default",
        file: path.relative(root, file),
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
  if (!/requireMysqlUri/.test(text)) {
    findings.push({
      rule: "mysql-uri-required-when-enabled",
      file: path.relative(root, file),
      line: 1,
      detail: "mysql adapter must call requireMysqlUri()",
    });
  }
}

const storageIndexFiles = [
  path.join(root, "src", "services", "lotteryStorage", "index.ts"),
  path.join(root, "src", "services", "modlistStorage", "index.ts"),
  path.join(root, "src", "services", "userGenerationStorage", "index.ts"),
];
for (const file of storageIndexFiles) {
  if (!fs.existsSync(file)) continue;
  const text = read(file);
  if (!/requireMysqlUri/.test(text)) {
    findings.push({
      rule: "mysql-uri-required-when-enabled",
      file: path.relative(root, file),
      line: 1,
      detail: "storage index must call requireMysqlUri() before loading mysql adapter",
    });
  }
  if (/mysql:\/\/root:password@/i.test(text)) {
    findings.push({
      rule: "no-weak-mysql-uri-default",
      file: path.relative(root, file),
      line: 1,
      detail: "storage index must not embed weak mysql URI defaults",
    });
  }
}

const mysqlUriPolicyTs = path.join(root, "src", "utils", "mysqlUriPolicy.ts");
if (!fs.existsSync(mysqlUriPolicyTs)) {
  findings.push({
    rule: "mysql-uri-required-when-enabled",
    file: "src/utils/mysqlUriPolicy.ts",
    line: 1,
    detail: "missing mysqlUriPolicy utility",
  });
} else {
  const policyText = read(mysqlUriPolicyTs);
  if (!/MYSQL_URI is required when a storage backend is set to mysql/.test(policyText)) {
    findings.push({
      rule: "mysql-uri-required-when-enabled",
      file: path.relative(root, mysqlUriPolicyTs),
      line: 1,
      detail: "mysqlUriPolicy must reject missing MYSQL_URI",
    });
  }
}

// Repo-wide scan (src + scripts) for reintroduced weak mysql defaults.
// Allow the policy modules / checkers / tests to mention the forbidden string as a detector pattern.
const allowWeakMysqlMention = new Set(
  [
    "scripts/check-audit-policies.js",
    "scripts/tests/test-audit-policies.js",
    "scripts/lib/mysqlUriPolicy.js",
    "src/utils/mysqlUriPolicy.ts",
  ].map((p) => p.replace(/\//g, path.sep)),
);
const scanFiles = walk(path.join(root, "src"), (file) => /\.(ts|tsx|js)$/.test(file)).concat(
  walk(path.join(root, "scripts"), (file) => /\.(ts|js)$/.test(file)),
);
for (const file of scanFiles) {
  const rel = path.relative(root, file);
  if (allowWeakMysqlMention.has(rel)) continue;
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, idx) => {
    // Only flag assignment/default usage, not comments describing the ban.
    if (
      /mysql:\/\/root:password@/i.test(line) &&
      !line.trim().startsWith("//") &&
      !line.trim().startsWith("*") &&
      !/reject|forbidden|must not|weak|example/i.test(line)
    ) {
      findings.push({
        rule: "no-weak-mysql-uri-default",
        file: rel,
        line: idx + 1,
        detail: line.trim().slice(0, 160),
      });
    }
  });
}


if (findings.length) {
  console.error("Audit policy check failed:");
  for (const finding of findings) {
    console.error(`- [${finding.rule}] ${finding.file}:${finding.line} ${finding.detail}`);
  }
  process.exit(1);
}

console.log("Audit policy check passed.");
