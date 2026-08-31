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
    "HEAD~1",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const ok = git(["rev-parse", "--verify", `${candidate}^{commit}`], { allowFailure: true });
    if (ok) return candidate;
  }
  // 不允许回退到 origin/main / HEAD（那会把 base 退化成被检查对象自身，等于不检查）。
  // 一个 base 都解析不出来时 fail-closed，而不是静默放行。
  console.error(
    "TypeScript size guard: 无法解析 base ref（TS_SIZE_BASE_REF / GITHUB_BASE_SHA 未设置或不可达，HEAD~1 不存在）。" +
    "拒绝退化为自比较，本次按失败处理。",
  );
  process.exit(1);
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
  // newPath -> basePath（重命名前的旧路径）或 null（新文件）
  const changed = new Map();
  const outputs = [
    git(["diff", "--name-status", "-M", "--diff-filter=ACMR", baseRef, "--", "*.ts", "*.tsx"], { allowFailure: true }),
    git(["diff", "--cached", "--name-status", "-M", "--diff-filter=ACMR", "--", "*.ts", "*.tsx"], { allowFailure: true }),
  ];

  for (const output of outputs) {
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      // 格式: A<tab>new  | M<tab>file  | R100<tab>old<tab>new
      const parts = line.split("\t");
      const status = parts[0] || "";
      if (status.startsWith("R") && parts.length >= 3) {
        // 重命名按旧路径取 base，避免超限遗留文件改名被误判为“新文件硬失败”
        changed.set(parts[2].replace(/\\/g, "/"), parts[1].replace(/\\/g, "/"));
      } else if (parts.length >= 2) {
        changed.set(parts[1].replace(/\\/g, "/"), null);
      }
    }
  }

  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"], { allowFailure: true });
  for (const file of untracked.split(/\r?\n/).filter(Boolean)) {
    changed.set(file.replace(/\\/g, "/"), null);
  }

  return [...changed.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const baseRef = resolveBaseRef();
const candidates = getCandidateFiles(baseRef);
const failures = [];
const observations = [];

for (const [file, basePath] of candidates) {
  const absolutePath = path.join(root, file);
  if (!fs.existsSync(absolutePath)) continue;

  const currentLines = countLines(fs.readFileSync(absolutePath, "utf8"));
  const baseContent = readBaseFile(baseRef, basePath || file);
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
