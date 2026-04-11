#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const AXIOS_SAFE_FLOOR = "1.15.0";
const AXIOS_SAFE_INTEGRITY =
  "sha512-wWyJDlAatxk30ZJer+GeCWS209sA42X+N5jU2jy6oHTp7ufw8uzUTVFBX9+wTfAlhiJXGS0Bq7X6efruWjuK9Q==";

const TARGETS = [
  {
    name: "root",
    dir: ROOT_DIR,
    packageJsonPath: path.join(ROOT_DIR, "package.json"),
    lockfilePath: path.join(ROOT_DIR, "pnpm-lock.yaml"),
  },
  {
    name: "frontend/docs",
    dir: path.join(ROOT_DIR, "frontend", "docs"),
    packageJsonPath: path.join(ROOT_DIR, "frontend", "docs", "package.json"),
    lockfilePath: path.join(ROOT_DIR, "frontend", "docs", "pnpm-lock.yaml"),
  },
];

function printDivider() {
  console.log("==========================================");
}

function printHeader(title) {
  printDivider();
  console.log(`  ${title}`);
  printDivider();
}

function printSection(index, total, title) {
  console.log(`\n[${index}/${total}] ${title}`);
}

function quotePowerShellArgument(argument) {
  return /^[A-Za-z0-9_./:\\@^=-]+$/.test(argument)
    ? argument
    : `'${argument.replace(/'/g, "''")}'`;
}

function formatPowerShellCommand(cwd, command, args) {
  return `PS ${cwd}> ${[command, ...args].map(quotePowerShellArgument).join(" ")}`;
}

function printAction(cwd, ...args) {
  console.log(formatPowerShellCommand(cwd, "Update-DependabotAlert", args));
}

function replaceAxiosVersionLine(packageJsonPath) {
  const originalText = fs.readFileSync(packageJsonPath, "utf8");
  const expression = /("axios"\s*:\s*")([^"]+)(")/;
  const match = originalText.match(expression);

  if (!match) {
    throw new Error(`Unable to find axios dependency in ${packageJsonPath}`);
  }

  const nextText = originalText.replace(
    expression,
    `$1^${AXIOS_SAFE_FLOOR}$3`,
  );

  if (nextText !== originalText) {
    fs.writeFileSync(packageJsonPath, nextText, "utf8");
  }
}

function replaceLockfileAxiosBlock(lockfilePath) {
  const originalText = fs.readFileSync(lockfilePath, "utf8");
  let nextText = originalText;

  nextText = nextText.replace(
    /(^(\s+)axios:\r?\n\2  specifier:\s*)\^[^\r\n]+(\r?\n\2  version:\s*)[^\r\n]+/m,
    `$1^${AXIOS_SAFE_FLOOR}$3${AXIOS_SAFE_FLOOR}`,
  );

  nextText = nextText.replace(/(^  axios@)\d+\.\d+\.\d+(:$)/gm, `$1${AXIOS_SAFE_FLOOR}$2`);

  nextText = nextText.replace(
    /(^  axios@1\.15\.0:\r?\n    resolution: \{integrity: )[^}]+(\})/m,
    `$1${AXIOS_SAFE_INTEGRITY}$2`,
  );

  if (nextText !== originalText) {
    fs.writeFileSync(lockfilePath, nextText, "utf8");
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function collectAxiosVersions(lockfilePath) {
  const lockfileText = fs.readFileSync(lockfilePath, "utf8");
  const expression = /^  axios@(\d+\.\d+\.\d+)(?:\([^\n]+\))?:$/gm;
  const versions = [];
  let match;

  while ((match = expression.exec(lockfileText)) !== null) {
    versions.push(match[1]);
  }

  return [...new Set(versions)];
}

function verifyTarget(target) {
  const packageJson = JSON.parse(fs.readFileSync(target.packageJsonPath, "utf8"));
  const axiosRange = packageJson.dependencies?.axios;

  if (axiosRange !== `^${AXIOS_SAFE_FLOOR}`) {
    throw new Error(
      `${path.relative(ROOT_DIR, target.packageJsonPath)} still resolves axios as ${axiosRange ?? "<missing>"}`,
    );
  }

  const axiosVersions = collectAxiosVersions(target.lockfilePath);

  if (axiosVersions.length === 0) {
    throw new Error(`axios was not found in ${path.relative(ROOT_DIR, target.lockfilePath)}`);
  }

  const vulnerableVersions = axiosVersions.filter(
    (version) => compareVersions(version, AXIOS_SAFE_FLOOR) < 0,
  );

  if (vulnerableVersions.length > 0) {
    throw new Error(
      `${path.relative(ROOT_DIR, target.lockfilePath)} still contains vulnerable axios versions: ${vulnerableVersions.join(", ")}`,
    );
  }

  const lockfileText = fs.readFileSync(target.lockfilePath, "utf8");

  if (!lockfileText.includes(AXIOS_SAFE_INTEGRITY)) {
    throw new Error(
      `${path.relative(ROOT_DIR, target.lockfilePath)} does not contain the expected axios integrity for ${AXIOS_SAFE_FLOOR}`,
    );
  }

  console.log(
    `[ok] ${target.name} -> ${path.relative(ROOT_DIR, target.packageJsonPath)} / ${path.relative(ROOT_DIR, target.lockfilePath)} -> axios ${axiosVersions.join(", ")}`,
  );
}

function updateTarget(target) {
  printAction(target.dir, "package.json", "axios", `^${AXIOS_SAFE_FLOOR}`);
  replaceAxiosVersionLine(target.packageJsonPath);
  printAction(target.dir, "pnpm-lock.yaml", "axios", AXIOS_SAFE_FLOOR);
  replaceLockfileAxiosBlock(target.lockfilePath);
  verifyTarget(target);
}

function main() {
  printHeader("Fixing Axios Dependabot Alerts");
  console.log(`Safe axios floor: ${AXIOS_SAFE_FLOOR}`);
  console.log("Targets: root, frontend/docs");

  TARGETS.forEach((target, index) => {
    printSection(index + 1, TARGETS.length, `refresh ${target.name}`);
    updateTarget(target);
  });

  console.log("\nDone.");
}

main();
