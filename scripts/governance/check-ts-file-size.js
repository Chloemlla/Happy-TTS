#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const maxLines = Number(process.env.MAX_TS_FILE_LINES || 800);
// Allow limited intentional growth in already-oversized modules (feature work / small hooks).
// New files and files that cross the 800-line boundary still fail hard.
const legacyGrowthBudget = Number(process.env.MAX_TS_LEGACY_GROWTH || 300);

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

function resolveBaseRef() {
  const candidates = [
    process.env.TS_SIZE_BASE_REF,
    process.env.GITHUB_BASE_SHA,
    "origin/main",
    "main",
    "HEAD~1",
    "HEAD",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const ok = git(["rev-parse", "--verify", `${candidate}^{commit}`], { allowFailure: true });
    if (ok) return candidate;
  }
  return "HEAD";
}

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
}

function readBaseFile(baseRef, file) {
  try {
    return git(["show", `${baseRef}:${file}`]);
  } catch {
    return null;
  }
}

function getCandidateFiles(baseRef) {
  const changed = new Set();
  const outputs = [
    git(["diff", "--name-only", "--diff-filter=ACMR", baseRef, "--", "*.ts", "*.tsx"], { allowFailure: true }),
    git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--", "*.ts", "*.tsx"], { allowFailure: true }),
    git(["ls-files", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"], { allowFailure: true }),
  ];

  for (const output of outputs) {
    for (const file of output.split(/\r?\n/).filter(Boolean)) {
      changed.add(file.replace(/\\/g, "/"));
    }
  }
  return [...changed].sort();
}

const baseRef = resolveBaseRef();
const candidates = getCandidateFiles(baseRef);
const failures = [];
const observations = [];

for (const file of candidates) {
  const absolutePath = path.join(root, file);
  if (!fs.existsSync(absolutePath)) continue;

  const currentLines = countLines(fs.readFileSync(absolutePath, "utf8"));
  const baseContent = readBaseFile(baseRef, file);
  const baseLines = baseContent === null ? null : countLines(baseContent);

  if (baseLines === null && currentLines > maxLines) {
    failures.push(`${file}: new file has ${currentLines} lines (limit ${maxLines})`);
    continue;
  }

  if (baseLines !== null && baseLines <= maxLines && currentLines > maxLines) {
    failures.push(`${file}: grew across the ${maxLines}-line limit (${baseLines} -> ${currentLines})`);
    continue;
  }

  if (baseLines !== null && baseLines > maxLines && currentLines > baseLines) {
    const growth = currentLines - baseLines;
    if (growth > legacyGrowthBudget) {
      failures.push(
        `${file}: oversized legacy file grew too much (${baseLines} -> ${currentLines}, +${growth}; budget +${legacyGrowthBudget}); split or reduce`,
      );
    } else {
      observations.push(
        `${file}: oversized legacy grew within budget (${baseLines} -> ${currentLines}, +${growth}/${legacyGrowthBudget})`,
      );
    }
    continue;
  }

  observations.push(`${file}: ${baseLines === null ? "new" : baseLines} -> ${currentLines}`);
}

console.log(`TypeScript size base ref: ${baseRef}`);
if (failures.length > 0) {
  console.error(`TypeScript size guard failed (${failures.length} violation(s)):`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  console.error("Existing files over the limit are grandfathered only while they do not grow.");
  process.exit(1);
}

console.log(`TypeScript size guard passed for ${candidates.length} changed file(s).`);
if (observations.length > 0) observations.forEach((item) => console.log(`  ${item}`));
