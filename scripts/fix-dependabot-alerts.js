#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverCodeScanningAlertPlan,
  runCodeScanningAutofix,
} from './lib/codeqlAlertFixer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MANIFEST_FILENAME = 'package.json';
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const COREPACK_COMMAND = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const IS_WINDOWS = process.platform === 'win32';

const GITHUB_API_ROOT = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const GITHUB_USER_AGENT = 'synapse-security-alert-fixer';
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const PINNED_DEPENDENCY_RANGES_BY_TARGET = {};

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.github',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
]);
const SUPPORTED_DEPENDABOT_ECOSYSTEMS = new Set(['npm']);

// 全局缓存已经探测成功的 pnpm 执行器命令，规避重复降级重试逻辑
let cachedPnpmCommand = null;

function parseCliArgs(argv) {
  const targets = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--target' && argv[index + 1]) {
      targets.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument.startsWith('--target=')) {
      targets.push(argument.slice('--target='.length));
    }
  }

  return {
    repairOnly: argv.includes('--repair') || argv.includes('--repair-only'),
    allTargets: argv.includes('--all') || argv.includes('--all-targets') || argv.includes('--no-alerts'),
    dependabotOnly: argv.includes('--dependabot-only'),
    codeqlOnly: argv.includes('--codeql-only') || argv.includes('--code-scanning-only'),
    skipCodeql: argv.includes('--skip-codeql') || argv.includes('--no-codeql'),
    skipDependabot: argv.includes('--skip-dependabot') || argv.includes('--no-dependabot'),
    targets,
  };
}

function printDivider() {
  console.log('==========================================');
}

function printHeader(title) {
  printDivider();
  console.log(`  ${title}`);
  printDivider();
}

function printSection(index, total, title) {
  console.log(`\n[${index}/${total}] ${title}`);
}

function quoteWindowsShellArgument(argument) {
  return /^[A-Za-z0-9_./:\\@%+=,~-]+$/.test(argument)
    ? argument
    : `'${argument.replace(/'/g, "''")}'`;
}

function quotePosixShellArgument(argument) {
  return /^[A-Za-z0-9_./:@%+=,~-]+$/.test(argument)
    ? argument
    : `'${argument.replace(/'/g, `'\\''`)}'`;
}

function quoteShellArgument(argument) {
  return IS_WINDOWS
    ? quoteWindowsShellArgument(argument)
    : quotePosixShellArgument(argument);
}

function formatShellCommand(cwd, command, args = []) {
  const prompt = IS_WINDOWS ? '>' : '$';
  return `${cwd}${prompt} ${[command, ...args].map(quoteShellArgument).join(' ')}`;
}

function printAction(cwd, command, args = []) {
  console.log(formatShellCommand(cwd, command, args));
}

function createSpawnError(commandLabel, cwd, error) {
  return Object.assign(
    new Error(`Unable to execute ${commandLabel} in ${cwd}: ${error.message}`),
    { code: error.code }
  );
}

function executeCommand(cwd, command, commandArgs, commandLabel) {
  return new Promise((resolve, reject) => {
    let isDone = false; // 引入状态锁，防止进程 error 和 exit 双重 reject 反模式

    // 在 Windows 上直接开启 shell: true，让 Node.js 原生、安全地处理 cmd/powershell 内部转义与执行策略
    const child = spawn(command, commandArgs, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: IS_WINDOWS,
      windowsHide: true,
    });

    child.on('error', (error) => {
      if (isDone) return;
      isDone = true;
      reject(createSpawnError(commandLabel, cwd, error));
    });

    child.on('exit', (code, signal) => {
      if (isDone) return;
      isDone = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${commandLabel} exited abnormally in ${cwd}: ${signal ? `signal ${signal}` : `code ${code}`}`
        )
      );
    });
  });
}

function captureCommand(cwd, command, commandArgs, commandLabel) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isDone = false;

    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
    });

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (isDone) return;
      isDone = true;
      reject(createSpawnError(commandLabel, cwd, error));
    });

    child.on('exit', (code, signal) => {
      if (isDone) return;
      isDone = true;

      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          `${commandLabel} exited abnormally in ${cwd}: ${signal ? `signal ${signal}` : `code ${code}`}${stderr ? `; ${stderr.trim()}` : ''}`
        )
      );
    });
  });
}

function getGitHubToken() {
  return (
    process.env.USER_PAT
    || process.env.GITHUB_TOKEN
    || process.env.GH_TOKEN
    || null
  );
}

function normalizeRepositoryName(repositoryValue) {
  const repository = `${repositoryValue ?? ''}`.trim();

  if (!repository) {
    return null;
  }

  const directMatch = repository.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (directMatch) {
    return `${directMatch[1]}/${directMatch[2]}`;
  }

  const sshMatch = repository.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  try {
    const url = new URL(repository);

    if (url.hostname.toLowerCase() !== 'github.com') {
      return null;
    }

    const parts = url.pathname
      .replace(/^\/+/, '')
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  } catch {
    return null;
  }

  return null;
}

async function inferGitHubRepository() {
  const envRepository = normalizeRepositoryName(
    process.env.GITHUB_REPOSITORY || process.env.REPOSITORY
  );

  if (envRepository) {
    return envRepository;
  }

  try {
    const remoteUrl = await captureCommand(
      ROOT_DIR,
      'git',
      ['config', '--get', 'remote.origin.url'],
      'git remote lookup'
    );

    return normalizeRepositoryName(remoteUrl);
  } catch {
    return null;
  }
}

function parseNextLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  for (const linkPart of linkHeader.split(',')) {
    const match = linkPart.match(/<([^>]+)>;\s*rel="next"/);

    if (!match) {
      continue;
    }

    const nextUrl = new URL(match[1]);
    return `${nextUrl.pathname}${nextUrl.search}`;
  }

  return null;
}

async function requestGitHubJson(apiPath, token) {
  const response = await fetch(`${GITHUB_API_ROOT}${apiPath}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': GITHUB_USER_AGENT,
      'x-github-api-version': GITHUB_API_VERSION,
    },
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    throw new Error(
      `GitHub API GET ${apiPath} failed: HTTP ${response.status} ${responseText || '<empty>'}`
    );
  }

  return {
    payload,
    nextPath: parseNextLink(response.headers.get('link')),
  };
}

async function fetchOpenDependabotAlerts(repository, token) {
  const [owner, repo] = repository.split('/');
  const alerts = [];
  let nextPath =
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/dependabot/alerts?state=open&per_page=100`;

  while (nextPath) {
    const { payload, nextPath: followingPath } = await requestGitHubJson(nextPath, token);
    alerts.push(...(Array.isArray(payload) ? payload : []));
    nextPath = followingPath;
  }

  return alerts;
}

function shouldUseDependabotAlertDiscovery(cliArgs) {
  return !cliArgs.repairOnly && !cliArgs.allTargets && cliArgs.targets.length === 0;
}

function collectDependencyNames(manifest) {
  return Array.from(
    new Set(
      DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {}))
    )
  ).sort((left, right) => left.localeCompare(right));
}

function collectDependencyCounts(manifest) {
  return DEPENDENCY_FIELDS.reduce((counts, field) => {
    counts[field] = Object.keys(manifest[field] ?? {}).length;
    return counts;
  }, {});
}

function cloneDependencySnapshot(manifest) {
  return DEPENDENCY_FIELDS.reduce((snapshot, field) => {
    snapshot[field] = { ...(manifest[field] ?? {}) };
    return snapshot;
  }, {});
}

function cloneOverrideSnapshot(manifest) {
  return { ...(manifest?.pnpm?.overrides ?? {}) };
}

function collectRangeChanges(beforeSnapshot, afterManifest) {
  const changes = [];

  for (const field of DEPENDENCY_FIELDS) {
    const beforeEntries = beforeSnapshot[field] ?? {};
    const afterEntries = afterManifest[field] ?? {};
    const dependencyNames = Array.from(
      new Set([...Object.keys(beforeEntries), ...Object.keys(afterEntries)])
    ).sort((left, right) => left.localeCompare(right));

    for (const dependencyName of dependencyNames) {
      const beforeRange = beforeEntries[dependencyName];
      const afterRange = afterEntries[dependencyName];

      if (beforeRange !== afterRange) {
        changes.push({
          field,
          name: dependencyName,
          beforeRange,
          afterRange,
        });
      }
    }
  }

  return changes;
}

function collectOverrideChanges(beforeSnapshot, afterManifest) {
  const beforeEntries = beforeSnapshot ?? {};
  const afterEntries = afterManifest?.pnpm?.overrides ?? {};
  const overrideNames = Array.from(
    new Set([...Object.keys(beforeEntries), ...Object.keys(afterEntries)])
  ).sort((left, right) => left.localeCompare(right));
  const changes = [];

  for (const overrideName of overrideNames) {
    const beforeRange = beforeEntries[overrideName];
    const afterRange = afterEntries[overrideName];

    if (beforeRange !== afterRange) {
      changes.push({
        name: overrideName,
        beforeRange,
        afterRange,
      });
    }
  }

  return changes;
}

function describeCounts(counts) {
  return DEPENDENCY_FIELDS
    .filter((field) => counts[field] > 0)
    .map((field) => `${field}:${counts[field]}`)
    .join(', ');
}

function formatChange(change) {
  return `${change.name} (${change.field}) ${change.beforeRange ?? '<missing>'} -> ${change.afterRange ?? '<removed>'}`;
}

function formatOverrideChange(change) {
  return `${change.name} (pnpm.overrides) ${change.beforeRange ?? '<missing>'} -> ${change.afterRange ?? '<removed>'}`;
}

async function readManifest(packageJsonPath) {
  const manifestText = await readFile(packageJsonPath, 'utf8');
  return JSON.parse(manifestText);
}

function collectDirectDependencyRanges(manifest) {
  const dependencyRanges = new Map();

  for (const field of DEPENDENCY_FIELDS) {
    for (const [dependencyName, dependencyRange] of Object.entries(
      manifest[field] ?? {}
    )) {
      if (!dependencyRanges.has(dependencyName)) {
        dependencyRanges.set(dependencyName, dependencyRange);
      }
    }
  }

  return dependencyRanges;
}

function normalizeDependabotEcosystem(ecosystem) {
  const normalizedEcosystem = `${ecosystem ?? ''}`.trim().toLowerCase();

  if (normalizedEcosystem === 'npm_and_yarn') {
    return 'npm';
  }

  return normalizedEcosystem;
}

function getDependabotAlertEcosystem(alert) {
  return normalizeDependabotEcosystem(
    alert?.dependency?.package?.ecosystem
    ?? alert?.security_vulnerability?.package?.ecosystem
  );
}

function getDependabotAlertPackageName(alert) {
  return (
    alert?.dependency?.package?.name
    ?? alert?.security_vulnerability?.package?.name
    ?? ''
  ).trim();
}

function getDependabotAlertManifestPath(alert) {
  return `${alert?.dependency?.manifest_path ?? ''}`.trim();
}

function getDependabotAlertFixedVersion(alert) {
  const fixedVersion =
    alert?.security_vulnerability?.first_patched_version?.identifier
    ?? alert?.security_advisory?.vulnerabilities
      ?.find((vulnerability) => vulnerability?.first_patched_version?.identifier)
      ?.first_patched_version
      ?.identifier;

  return typeof fixedVersion === 'string' && fixedVersion.trim().length > 0
    ? fixedVersion.trim()
    : null;
}

function normalizeRepoPath(repoPath) {
  const normalizedPath = `${repoPath ?? ''}`
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');

  return normalizedPath === '.' ? '' : normalizedPath;
}

function getRepoPathDir(repoPath) {
  const normalizedPath = normalizeRepoPath(repoPath);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return '';
  }

  return normalizedPath.slice(0, lastSlashIndex);
}

function getNpmTargetPathInfo(target) {
  return {
    dirLabel: normalizeRepoPath(path.relative(ROOT_DIR, target.dir)),
    packageJsonLabel: normalizeRepoPath(target.packageJsonLabel),
    lockfileLabel: normalizeRepoPath(path.relative(ROOT_DIR, target.lockfilePath)),
  };
}

function dependabotAlertPathMatchesNpmTarget(alertManifestPath, target) {
  const normalizedAlertPath = normalizeRepoPath(alertManifestPath);

  if (!normalizedAlertPath) {
    return false;
  }

  const targetPathInfo = getNpmTargetPathInfo(target);
  const alertDir = getRepoPathDir(normalizedAlertPath);

  return (
    normalizedAlertPath === targetPathInfo.packageJsonLabel
    || normalizedAlertPath === targetPathInfo.lockfileLabel
    || alertDir === targetPathInfo.dirLabel
  );
}

function findNpmTargetsForDependabotAlert(alert, targets) {
  const alertManifestPath = getDependabotAlertManifestPath(alert);
  const packageName = getDependabotAlertPackageName(alert);
  let matches = [];

  if (alertManifestPath) {
    matches = targets.filter((target) =>
      dependabotAlertPathMatchesNpmTarget(alertManifestPath, target)
    );
  }

  if (matches.length === 0 && packageName) {
    matches = targets.filter((target) => target.dependencyNames.includes(packageName));
  }

  // Dependabot can report a transitive npm alert against a lockfile path that is
  // absent locally. Updating every npm target is safer than silently skipping it.
  if (matches.length === 0 && targets.length > 0) {
    matches = targets;
  }

  return matches;
}

function addAlertToTargetMap(alertsByTarget, target, alert) {
  if (!alertsByTarget.has(target)) {
    alertsByTarget.set(target, []);
  }

  alertsByTarget.get(target).push(alert);
}

function createDependabotAlertPlan(alerts, pnpmTargets) {
  const npmAlertsByTarget = new Map();
  const unsupportedAlerts = [];
  const unmatchedAlerts = [];

  for (const alert of alerts) {
    const ecosystem = getDependabotAlertEcosystem(alert);

    if (!SUPPORTED_DEPENDABOT_ECOSYSTEMS.has(ecosystem)) {
      unsupportedAlerts.push(alert);
      continue;
    }

    if (ecosystem === 'npm') {
      const matches = findNpmTargetsForDependabotAlert(alert, pnpmTargets);

      if (matches.length === 0) {
        unmatchedAlerts.push(alert);
        continue;
      }

      for (const target of matches) {
        addAlertToTargetMap(npmAlertsByTarget, target, alert);
      }

      continue;
    }
  }

  return {
    alerts,
    npmAlertsByTarget,
    unsupportedAlerts,
    unmatchedAlerts,
  };
}

function formatDependabotAlert(alert) {
  const alertNumber = alert?.number ? `#${alert.number}` : '#?';
  const ecosystem = getDependabotAlertEcosystem(alert) || '<unknown ecosystem>';
  const packageName = getDependabotAlertPackageName(alert) || '<unknown package>';
  const manifestPath = getDependabotAlertManifestPath(alert) || '<unknown manifest>';
  const fixedVersion = getDependabotAlertFixedVersion(alert);

  return `${alertNumber} ${ecosystem}:${packageName} (${manifestPath})${fixedVersion ? ` patched in ${fixedVersion}` : ''}`;
}

function printDependabotAlertDiscovery(repository, plan) {
  const npmTargetCount = plan.npmAlertsByTarget.size;

  console.log(`Dependabot alert discovery: ${plan.alerts.length} open alert(s) from ${repository}.`);
  console.log(`Actionable targets from alerts: ${npmTargetCount}`);

  for (const [target, alerts] of plan.npmAlertsByTarget.entries()) {
    const packages = Array.from(new Set(alerts.map(getDependabotAlertPackageName).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right));
    console.log(
      `- ${target.packageJsonLabel}: ${alerts.length} npm alert(s)${packages.length > 0 ? ` (${packages.join(', ')})` : ''}`
    );
  }

  if (plan.unsupportedAlerts.length > 0) {
    console.log(`- Unsupported alert ecosystem(s): ${plan.unsupportedAlerts.length}`);
    plan.unsupportedAlerts
      .slice(0, 10)
      .forEach((alert) => console.log(`  - ${formatDependabotAlert(alert)}`));
  }

  if (plan.unmatchedAlerts.length > 0) {
    console.log(`- Alerts without a local target: ${plan.unmatchedAlerts.length}`);
    plan.unmatchedAlerts
      .slice(0, 10)
      .forEach((alert) => console.log(`  - ${formatDependabotAlert(alert)}`));
  }
}

async function discoverDependabotAlertPlan(cliArgs, pnpmTargets) {
  if (!shouldUseDependabotAlertDiscovery(cliArgs)) {
    return null;
  }

  const token = getGitHubToken();
  const repository = await inferGitHubRepository();

  if (!token || !repository) {
    console.log(
      'Dependabot alert discovery skipped: USER_PAT/GITHUB_TOKEN or GitHub repository could not be detected.'
    );
    return null;
  }

  try {
    const alerts = await fetchOpenDependabotAlerts(repository, token);
    const plan = createDependabotAlertPlan(alerts, pnpmTargets);
    printDependabotAlertDiscovery(repository, plan);
    return plan;
  } catch (error) {
    throw new Error(
      `${error.message}. Ensure USER_PAT can read Dependabot alerts for ${repository}.`
    );
  }
}

function normalizePnpmOverrides(manifest) {
  const overrides = manifest?.pnpm?.overrides;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return [];
  }

  const directDependencyRanges = collectDirectDependencyRanges(manifest);
  const changes = [];

  for (const [overrideName, overrideRange] of Object.entries(overrides)) {
    if (!directDependencyRanges.has(overrideName)) {
      continue;
    }

    const nextOverrideRange = `$${overrideName}`;
    if (overrideRange === nextOverrideRange) {
      continue;
    }

    overrides[overrideName] = nextOverrideRange;
    changes.push({
      name: overrideName,
      beforeRange: overrideRange,
      afterRange: nextOverrideRange,
    });
  }

  return changes;
}

function parseSimpleNpmVersion(version) {
  const match = `${version ?? ''}`
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]+)?$/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function compareSimpleNpmVersions(leftVersion, rightVersion) {
  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major;
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor;
  }

  return leftVersion.patch - rightVersion.patch;
}

function extractFirstSimpleNpmVersion(versionRange) {
  return `${versionRange ?? ''}`.match(/v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?/)?.[0] ?? null;
}

function isOverrideRangeAtLeast(overrideRange, fixedVersion) {
  const currentVersion = parseSimpleNpmVersion(extractFirstSimpleNpmVersion(overrideRange));
  const requiredVersion = parseSimpleNpmVersion(fixedVersion);

  if (!currentVersion || !requiredVersion) {
    return false;
  }

  return compareSimpleNpmVersions(currentVersion, requiredVersion) >= 0;
}

function applyDependabotAlertOverrides(target, manifest, alerts = []) {
  if (alerts.length === 0) {
    return [];
  }

  const directDependencyRanges = collectDirectDependencyRanges(manifest);
  const changes = [];

  for (const alert of alerts) {
    const packageName = getDependabotAlertPackageName(alert);
    const fixedVersion = getDependabotAlertFixedVersion(alert);

    if (!packageName || !fixedVersion || directDependencyRanges.has(packageName)) {
      continue;
    }

    if (!manifest.pnpm || typeof manifest.pnpm !== 'object' || Array.isArray(manifest.pnpm)) {
      manifest.pnpm = {};
    }

    if (!manifest.pnpm.overrides || typeof manifest.pnpm.overrides !== 'object' || Array.isArray(manifest.pnpm.overrides)) {
      manifest.pnpm.overrides = {};
    }

    const beforeRange = manifest.pnpm.overrides[packageName];

    if (beforeRange && isOverrideRangeAtLeast(beforeRange, fixedVersion)) {
      continue;
    }

    const afterRange = `>=${fixedVersion}`;
    manifest.pnpm.overrides[packageName] = afterRange;
    changes.push({
      name: packageName,
      beforeRange,
      afterRange,
      alert: formatDependabotAlert(alert),
    });
  }

  if (changes.length > 0) {
    console.log(
      `  - Added ${changes.length} Dependabot-driven pnpm override${changes.length === 1 ? '' : 's'} in ${target.packageJsonLabel}.`
    );
  }

  return changes;
}

async function rewriteManifest(packageJsonPath, manifest) {
  const currentManifestText = await readFile(packageJsonPath, 'utf8');
  const newline = currentManifestText.includes('\r\n') ? '\r\n' : '\n';

  // 安全的换行符替换，仅替换系统默认换行
  const serialized = JSON.stringify(manifest, null, 2);
  const normalizedText = newline === '\r\n'
    ? serialized.replace(/\n/g, '\r\n')
    : serialized;

  await writeFile(packageJsonPath, `${normalizedText}${newline}`);
}

function applyPinnedDependencyRanges(target, manifest) {
  const pinnedRanges = PINNED_DEPENDENCY_RANGES_BY_TARGET[target.packageJsonLabel];

  if (!pinnedRanges) {
    return [];
  }

  const changes = [];

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== 'object') {
      continue;
    }

    for (const [dependencyName, pinnedRange] of Object.entries(pinnedRanges)) {
      if (!(dependencyName in dependencies) || dependencies[dependencyName] === pinnedRange) {
        continue;
      }

      changes.push({
        field,
        name: dependencyName,
        beforeRange: dependencies[dependencyName],
        afterRange: pinnedRange,
      });
      dependencies[dependencyName] = pinnedRange;
    }
  }

  return changes;
}

function createPnpmExecutor(target) {
  return async (args) => {
    // 如果已有成功缓存的指令组合，直接采用，避免多目录重复触发多次 ENOENT 探测
    if (cachedPnpmCommand) {
      const [command, ...baseArgs] = cachedPnpmCommand;
      const finalArgs = [...baseArgs, ...args];
      printAction(target.dir, command, finalArgs);
      await executeCommand(target.dir, command, finalArgs, `${command} for ${target.packageJsonLabel}`);
      return;
    }

    printAction(target.dir, 'pnpm', args);

    try {
      await executeCommand(target.dir, PNPM_COMMAND, args, `pnpm for ${target.packageJsonLabel}`);
      cachedPnpmCommand = [PNPM_COMMAND];
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }

      console.log('  - pnpm was not found on PATH, retrying with corepack.');
      const corepackArgs = ['pnpm', ...args];
      printAction(target.dir, 'corepack', corepackArgs);

      try {
        await executeCommand(
          target.dir,
          COREPACK_COMMAND,
          corepackArgs,
          `corepack pnpm for ${target.packageJsonLabel}`
        );
        cachedPnpmCommand = [COREPACK_COMMAND, 'pnpm'];
      } catch (corepackError) {
        if (corepackError?.code === 'ENOENT') {
          throw new Error(
            `Neither pnpm nor corepack is available in ${target.dir}. Install pnpm or enable Corepack before running this script.`
          );
        }

        throw corepackError;
      }
    }
  };
}

async function collectPackageJsonPaths(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const packageJsonPaths = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      packageJsonPaths.push(...(await collectPackageJsonPaths(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
      packageJsonPaths.push(entryPath);
    }
  }

  return packageJsonPaths;
}

function normalizeTargetFilter(targetFilter) {
  return `${targetFilter}`
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/$/, '');
}

function targetMatchesCliArgs(candidateValues, cliArgs) {
  if (cliArgs.targets.length === 0) {
    return true;
  }

  const normalizedFilters = cliArgs.targets.map(normalizeTargetFilter);
  const normalizedValues = candidateValues
    .map(normalizeTargetFilter)
    .filter((value) => value.length > 0);

  return normalizedFilters.some((targetFilter) =>
    normalizedValues.some((candidateValue) =>
      targetFilter === candidateValue || candidateValue.endsWith(`/${targetFilter}`)
    )
  );
}

function filterTargetsByCliArgs(targets, cliArgs) {
  return targets.filter((target) =>
    targetMatchesCliArgs(
      [
        target.packageJsonLabel,
        path.relative(ROOT_DIR, target.dir) || '.',
      ],
      cliArgs
    )
  );
}

async function discoverTargets() {
  const packageJsonPaths = await collectPackageJsonPaths(ROOT_DIR);
  const targets = [];

  for (const packageJsonPath of packageJsonPaths.sort((left, right) => left.localeCompare(right))) {
    const manifest = await readManifest(packageJsonPath);
    const dependencyNames = collectDependencyNames(manifest);

    if (dependencyNames.length === 0) {
      continue;
    }

    const directoryPath = path.dirname(packageJsonPath);
    targets.push({
      dir: directoryPath,
      packageJsonPath,
      packageJsonLabel: path.relative(ROOT_DIR, packageJsonPath) || MANIFEST_FILENAME,
      lockfilePath: path.join(directoryPath, 'pnpm-lock.yaml'),
      dependencyNames,
      dependencyCounts: collectDependencyCounts(manifest),
      beforeSnapshot: cloneDependencySnapshot(manifest),
      beforeOverrideSnapshot: cloneOverrideSnapshot(manifest),
    });
  }

  return targets;
}

async function runPnpmUpgrade(target, options = {}) {
  const runPnpmCommand = createPnpmExecutor(target);
  const dependabotAlerts = options.dependabotAlerts ?? [];

  if (!options.repairOnly) {
    if (dependabotAlerts.length > 0) {
      const alertPackages = Array.from(new Set(dependabotAlerts.map(getDependabotAlertPackageName).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right));
      console.log(
        `  - Dependabot alert packages for ${target.packageJsonLabel}: ${alertPackages.join(', ') || '<unknown>'}`
      );
    }

    // 处理极大依赖列表时的防御，普通项目虽然达不到系统的 E2BIG 限制，但这是一种良好的 Node.js 实践
    await runPnpmCommand(['up', '--latest', '--lockfile-only', ...target.dependencyNames]);
  }

  const nextManifest = await readManifest(target.packageJsonPath);
  const pinnedRangeChanges = applyPinnedDependencyRanges(target, nextManifest);
  const dependabotOverrideChanges = applyDependabotAlertOverrides(
    target,
    nextManifest,
    dependabotAlerts
  );
  const overrideChanges = normalizePnpmOverrides(nextManifest);

  if (pinnedRangeChanges.length > 0 || dependabotOverrideChanges.length > 0 || overrideChanges.length > 0) {
    await rewriteManifest(target.packageJsonPath, nextManifest);
    if (pinnedRangeChanges.length > 0) {
      console.log(
        `  - Reapplied ${pinnedRangeChanges.length} pinned dependency range${pinnedRangeChanges.length === 1 ? '' : 's'}.`
      );
    }
    if (dependabotOverrideChanges.length > 0) {
      dependabotOverrideChanges
        .slice(0, 10)
        .forEach((change) => console.log(`  - ${formatOverrideChange(change)}`));
    }
    console.log(
      `  - Normalized ${overrideChanges.length} overlapping pnpm override${overrideChanges.length === 1 ? '' : 's'} to $dependency references.`
    );
  }

  await runPnpmCommand(['install', '--lockfile-only']);
}

async function verifyTarget(target) {
  const nextManifest = await readManifest(target.packageJsonPath);
  const changedRanges = collectRangeChanges(target.beforeSnapshot, nextManifest);
  const changedOverrides = collectOverrideChanges(
    target.beforeOverrideSnapshot,
    nextManifest
  );
  const lockfileExists = existsSync(target.lockfilePath);
  const lockfileLabel = lockfileExists
    ? path.relative(ROOT_DIR, target.lockfilePath)
    : '<no local pnpm-lock.yaml>';

  console.log(
    `[ok] ${target.packageJsonLabel} -> ${target.dependencyNames.length} dependencies inspected, ${changedRanges.length} ranges updated, ${changedOverrides.length} override fix${changedOverrides.length === 1 ? '' : 'es'}, lockfile: ${lockfileLabel}`
  );

  if (changedRanges.length > 0) {
    const preview = changedRanges.slice(0, 10).map(formatChange);
    preview.forEach((line) => console.log(`  - ${line}`));

    if (changedRanges.length > preview.length) {
      console.log(`  - ... ${changedRanges.length - preview.length} more`);
    }
  } else {
    console.log('  - Already at the newest published ranges or no manifest rewrite was necessary.');
  }

  if (changedOverrides.length > 0) {
    const preview = changedOverrides.slice(0, 10).map(formatOverrideChange);
    preview.forEach((line) => console.log(`  - ${line}`));

    if (changedOverrides.length > preview.length) {
      console.log(`  - ... ${changedOverrides.length - preview.length} more override changes`);
    }
  }
}

async function runPnpmUpgradeLane(targets, cliArgs, dependabotAlertPlan = null) {
  for (const [index, target] of targets.entries()) {
    const dependabotAlerts = dependabotAlertPlan?.npmAlertsByTarget.get(target) ?? [];

    printSection(
      index + 1,
      targets.length,
      `pnpm lane: ${cliArgs.repairOnly ? 'repair' : 'upgrade'} ${target.packageJsonLabel}`
    );
    await runPnpmUpgrade(target, {
      ...cliArgs,
      dependabotAlerts,
    });
    await verifyTarget(target);
  }
}

async function runDependencyLanes(lanes) {
  if (lanes.length > 1) {
    console.log(`Execution: ${lanes.map((lane) => lane.label).join(' + ')} lanes in parallel`);
  } else {
    console.log(`Execution: ${lanes[0].label} lane`);
  }

  const results = await Promise.allSettled(lanes.map((lane) => lane.run()));
  const failures = results
    .map((result, index) => ({
      label: lanes[index].label,
      result,
    }))
    .filter(({ result }) => result.status === 'rejected');

  if (failures.length > 0) {
    throw new Error(
      failures
        .map(({ label, result }) => `${label} lane failed: ${result.reason?.message ?? result.reason}`)
        .join('; ')
    );
  }
}

function shouldRunDependabotLane(cliArgs) {
  if (cliArgs.codeqlOnly) {
    return false;
  }

  if (cliArgs.skipDependabot) {
    return false;
  }

  return true;
}

function shouldRunCodeqlLane(cliArgs) {
  if (cliArgs.repairOnly || cliArgs.dependabotOnly || cliArgs.skipCodeql) {
    return false;
  }

  if (cliArgs.allTargets && !cliArgs.codeqlOnly) {
    // --all is a full dependency upgrade path; CodeQL remains opt-in unless --codeql-only.
    return false;
  }

  return true;
}

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const runDependabot = shouldRunDependabotLane(cliArgs);
  const runCodeql = shouldRunCodeqlLane(cliArgs);

  printHeader(
    cliArgs.repairOnly
      ? 'Repair Dependabot Dependency State'
      : cliArgs.codeqlOnly
        ? 'Auto-fix CodeQL Security Alerts'
        : runDependabot && runCodeql
          ? 'Auto-fix Dependabot + CodeQL Security Alerts'
          : runCodeql
            ? 'Auto-fix CodeQL Security Alerts'
            : 'Upgrade Package Dependencies For Dependabot'
  );

  console.log(`Repository root: ${ROOT_DIR}`);
  console.log(
    `Lanes: ${[
      runDependabot ? 'dependabot' : null,
      runCodeql ? 'codeql' : null,
    ].filter(Boolean).join(' + ') || '<none>'}`
  );

  let dependabotAlertPlan = null;
  let filteredPnpmTargets = [];
  let totalDependencyTargets = 0;

  if (runDependabot) {
    const pnpmTargets = await discoverTargets();

    dependabotAlertPlan = await discoverDependabotAlertPlan(
      cliArgs,
      pnpmTargets
    );

    filteredPnpmTargets = dependabotAlertPlan
      ? Array.from(dependabotAlertPlan.npmAlertsByTarget.keys())
      : filterTargetsByCliArgs(pnpmTargets, cliArgs);
    totalDependencyTargets = filteredPnpmTargets.length;

    if (totalDependencyTargets === 0) {
      if (dependabotAlertPlan && dependabotAlertPlan.alerts.length === 0) {
        console.log('No open Dependabot alerts found for this repository.');
      } else if (dependabotAlertPlan && !runCodeql) {
        throw new Error(
          'Open Dependabot alerts were found, but none matched a supported local dependency target.'
        );
      } else if (dependabotAlertPlan && runCodeql) {
        console.log(
          'Dependabot lane: open alerts found, but none matched a supported local dependency target; continuing with CodeQL lane.'
        );
      } else if (!runCodeql) {
        throw new Error(
          cliArgs.targets.length > 0
            ? `No dependency target matched: ${cliArgs.targets.join(', ')}`
            : 'No package.json with dependencies was found under the repository root.'
        );
      } else {
        console.log('Dependabot lane: no actionable dependency targets.');
      }
    } else {
      console.log(`Dependabot targets: ${totalDependencyTargets}`);
      console.log(
        `Dependabot mode: ${cliArgs.repairOnly ? 'repair-only' : dependabotAlertPlan ? 'alert-driven upgrade' : 'upgrade'}`
      );

      if (cliArgs.targets.length > 0 && !dependabotAlertPlan) {
        console.log(`Target filter: ${cliArgs.targets.join(', ')}`);
      }
      if (cliArgs.allTargets) {
        console.log('Dependabot alert discovery: disabled by --all/--all-targets/--no-alerts.');
      }

      for (const target of filteredPnpmTargets) {
        console.log(
          `- ${target.packageJsonLabel} (${describeCounts(target.dependencyCounts)})`
        );
      }
    }
  }

  let codeScanningPlan = null;
  if (runCodeql) {
    const token = getGitHubToken();
    const repository = await inferGitHubRepository();

    if (!token || !repository) {
      console.log(
        'CodeQL alert discovery skipped: USER_PAT/GITHUB_TOKEN or GitHub repository could not be detected.'
      );
    } else {
      try {
        codeScanningPlan = await discoverCodeScanningAlertPlan({
          repository,
          token,
          apiRoot: GITHUB_API_ROOT,
          apiVersion: GITHUB_API_VERSION,
        });
      } catch (error) {
        throw new Error(
          `${error.message}. Ensure USER_PAT can read code-scanning alerts for ${repository}.`
        );
      }
    }
  }

  if (
    runDependabot
    && totalDependencyTargets === 0
    && runCodeql
    && (!codeScanningPlan || codeScanningPlan.autofixable.length === 0)
    && (!dependabotAlertPlan || dependabotAlertPlan.alerts.length === 0)
    && (!codeScanningPlan || codeScanningPlan.alerts.length === 0)
  ) {
    console.log('No open Dependabot or CodeQL alerts found for this repository.');
    console.log('\nDone.');
    return;
  }

  const lanes = [];

  if (runDependabot && totalDependencyTargets > 0) {
    if (filteredPnpmTargets.length > 0) {
      lanes.push({
        label: 'pnpm',
        run: () => runPnpmUpgradeLane(filteredPnpmTargets, cliArgs, dependabotAlertPlan),
      });
    }
  }

  if (runCodeql && codeScanningPlan) {
    lanes.push({
      label: 'codeql',
      run: () => runCodeScanningAutofix(ROOT_DIR, codeScanningPlan),
    });
  }

  if (lanes.length === 0) {
    if (runCodeql && codeScanningPlan && codeScanningPlan.alerts.length > 0 && codeScanningPlan.autofixable.length === 0) {
      console.log(
        `CodeQL alerts are open (${codeScanningPlan.alerts.length}), but none are currently autofixable by supported rules.`
      );
      console.log('\nDone.');
      return;
    }

    throw new Error('No security maintenance lane produced actionable work.');
  }

  await runDependencyLanes(lanes);

  console.log('\nDone.');
}
main().catch((error) => {
  console.error(`\n[failed] ${error.message}`);
  process.exitCode = 1;
});