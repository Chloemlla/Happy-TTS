#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIRNAME = 'backend';
const MANIFEST_FILENAME = 'package.json';
const CARGO_MANIFEST_FILENAME = 'Cargo.toml';
const CARGO_LOCK_FILENAME = 'Cargo.lock';
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const COREPACK_COMMAND = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const CARGO_COMMAND = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const IS_WINDOWS = process.platform === 'win32';
const CRATES_IO_API_ROOT = 'https://crates.io/api/v1/crates';
const CRATES_IO_USER_AGENT = 'geograba-dependabot-alert-fixer';
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const RUST_DEPENDENCY_FIELDS = [
  'dependencies',
  'dev-dependencies',
  'build-dependencies',
];
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.github',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
]);

function parseCliArgs(argv) {
  return {
    repairOnly: argv.includes('--repair') || argv.includes('--repair-only'),
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

function quoteShellArgument(argument) {
  if (/^[A-Za-z0-9_./:@%+=,~-]+$/.test(argument)) {
    return argument;
  }

  if (IS_WINDOWS) {
    return `'${argument.replace(/'/g, "''")}'`;
  }

  return `'${argument.replace(/'/g, `'\\''`)}'`;
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

async function rewriteManifest(packageJsonPath, manifest) {
  const currentManifestText = await readFile(packageJsonPath, 'utf8');
  const newline = currentManifestText.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(manifest, null, 2).replace(/\n/g, newline)}${newline}`
  );
}

function createPnpmExecutor(target) {
  const executePnpm = (command, commandArgs, commandLabel) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        cwd: target.dir,
        stdio: 'inherit',
        env: process.env,
        shell: IS_WINDOWS,
        windowsHide: true,
      });

      child.on('error', (error) => {
        reject(createSpawnError(commandLabel, target.dir, error));
      });

      child.on('exit', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `${commandLabel} exited abnormally for ${target.packageJsonLabel}: ${signal ? `signal ${signal}` : `code ${code}`}`
          )
        );
      });
    });

  return async (args) => {
    printAction(target.dir, 'pnpm', args);

    try {
      await executePnpm(PNPM_COMMAND, args, 'pnpm');
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }

      console.log('  - pnpm was not found on PATH, retrying with corepack.');
      printAction(target.dir, 'corepack', ['pnpm', ...args]);

      try {
        await executePnpm(COREPACK_COMMAND, ['pnpm', ...args], 'corepack pnpm');
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

function isRustDependencySection(sectionName) {
  return RUST_DEPENDENCY_FIELDS.some(
    (field) => sectionName === field || sectionName.endsWith(`.${field}`)
  );
}

function getRustDependencyField(sectionName) {
  return (
    RUST_DEPENDENCY_FIELDS.find(
      (field) => sectionName === field || sectionName.endsWith(`.${field}`)
    ) ?? 'dependencies'
  );
}

function collectRustDependencyEntries(manifestText) {
  const lines = manifestText.split(/\r?\n/);
  const dependencyEntries = [];
  let currentSectionName = '';

  for (const [lineIndex, line] of lines.entries()) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const sectionMatch = trimmedLine.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSectionName = sectionMatch[1].trim();
      continue;
    }

    if (!isRustDependencySection(currentSectionName)) {
      continue;
    }

    const stringDependencyMatch = line.match(
      /^(\s*)([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"(\s*(#.*)?)?$/
    );

    if (stringDependencyMatch) {
      const indent = stringDependencyMatch[1] ?? '';
      const dependencyName = stringDependencyMatch[2];
      const versionSpec = stringDependencyMatch[3];
      const trailingComment = stringDependencyMatch[4] ?? '';

      dependencyEntries.push({
        lineIndex,
        dependencyName,
        crateName: dependencyName,
        section: currentSectionName,
        versionSpec,
        updateLine(nextVersionSpec) {
          return `${indent}${dependencyName} = "${nextVersionSpec}"${trailingComment}`;
        },
      });
      continue;
    }

    const inlineTableMatch = line.match(
      /^(\s*)([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}(\s*(#.*)?)?$/
    );

    if (!inlineTableMatch) {
      continue;
    }

    const dependencyName = inlineTableMatch[2];
    const packageNameMatch = inlineTableMatch[3].match(/\bpackage\s*=\s*"([^"]+)"/);
    const versionMatch = inlineTableMatch[3].match(/\bversion\s*=\s*"([^"]+)"/);

    if (!versionMatch) {
      continue;
    }

    const versionSpec = versionMatch[1];
    dependencyEntries.push({
      lineIndex,
      dependencyName,
      crateName: packageNameMatch?.[1] ?? dependencyName,
      section: currentSectionName,
      versionSpec,
      updateLine(nextVersionSpec) {
        return line.replace(versionMatch[0], versionMatch[0].replace(versionSpec, nextVersionSpec));
      },
    });
  }

  return dependencyEntries;
}

function collectRustDependencyCounts(dependencyEntries) {
  return dependencyEntries.reduce(
    (counts, dependencyEntry) => {
      counts[getRustDependencyField(dependencyEntry.section)] += 1;
      return counts;
    },
    {
      dependencies: 0,
      'dev-dependencies': 0,
      'build-dependencies': 0,
    }
  );
}

function describeRustCounts(counts) {
  return RUST_DEPENDENCY_FIELDS
    .filter((field) => counts[field] > 0)
    .map((field) => `${field}:${counts[field]}`)
    .join(', ');
}

function buildRustDependencyKey(dependencyEntry) {
  return `${dependencyEntry.section}:${dependencyEntry.dependencyName}`;
}

function collectRustRangeChanges(beforeDependencyEntries, afterDependencyEntries) {
  const beforeEntriesByKey = new Map(
    beforeDependencyEntries.map((dependencyEntry) => [
      buildRustDependencyKey(dependencyEntry),
      dependencyEntry,
    ])
  );
  const afterEntriesByKey = new Map(
    afterDependencyEntries.map((dependencyEntry) => [
      buildRustDependencyKey(dependencyEntry),
      dependencyEntry,
    ])
  );
  const dependencyKeys = Array.from(
    new Set([...beforeEntriesByKey.keys(), ...afterEntriesByKey.keys()])
  ).sort((left, right) => left.localeCompare(right));
  const changes = [];

  for (const dependencyKey of dependencyKeys) {
    const beforeEntry = beforeEntriesByKey.get(dependencyKey);
    const afterEntry = afterEntriesByKey.get(dependencyKey);
    const beforeRange = beforeEntry?.versionSpec;
    const afterRange = afterEntry?.versionSpec;

    if (beforeRange !== afterRange) {
      changes.push({
        section: beforeEntry?.section ?? afterEntry?.section ?? 'dependencies',
        dependencyName: beforeEntry?.dependencyName ?? afterEntry?.dependencyName ?? dependencyKey,
        crateName: beforeEntry?.crateName ?? afterEntry?.crateName ?? dependencyKey,
        beforeRange,
        afterRange,
      });
    }
  }

  return changes;
}

function formatRustChange(change) {
  const dependencyLabel = change.dependencyName === change.crateName
    ? change.dependencyName
    : `${change.dependencyName} => ${change.crateName}`;

  return `${dependencyLabel} (${getRustDependencyField(change.section)}) ${change.beforeRange ?? '<missing>'} -> ${change.afterRange ?? '<removed>'}`;
}

function parseSimpleRustVersion(version) {
  const match = `${version}`.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.+-]+)?$/);

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw: match[0],
  };
}

function compareSimpleRustVersions(leftVersion, rightVersion) {
  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major;
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor;
  }

  return leftVersion.patch - rightVersion.patch;
}

function isCompatibleRustVersion(currentVersion, candidateVersion) {
  if (currentVersion.major === 0) {
    return (
      candidateVersion.major === 0
      && candidateVersion.minor === currentVersion.minor
    );
  }

  return candidateVersion.major === currentVersion.major;
}

function buildLatestRustVersionSpec(currentVersionSpec, nextVersion) {
  const trimmedVersionSpec = currentVersionSpec.trim();
  const simpleVersionMatch = trimmedVersionSpec.match(/^([~^=]?)(\d+(?:\.\d+)*(?:-[0-9A-Za-z.+-]+)?)$/);

  if (!simpleVersionMatch) {
    return null;
  }

  return `${simpleVersionMatch[1]}${nextVersion}`;
}

async function fetchLatestCompatibleCrateVersion(crateName, currentVersionSpec, versionCache) {
  const normalizedVersionSpec = `${currentVersionSpec}`.trim();
  const simpleVersionMatch = normalizedVersionSpec.match(/^[~^=]?(\d+\.\d+\.\d+|\d+\.\d+|\d+)$/);

  if (!simpleVersionMatch) {
    return null;
  }

  const currentVersionText = simpleVersionMatch[1]
    .split('.')
    .concat(['0', '0'])
    .slice(0, 3)
    .join('.');
  const currentVersion = parseSimpleRustVersion(currentVersionText);

  if (!currentVersion) {
    return null;
  }

  const cacheKey = `${crateName}@${currentVersion.major}.${currentVersion.minor}`;
  if (versionCache.has(cacheKey)) {
    return versionCache.get(cacheKey);
  }

  const response = await fetch(`${CRATES_IO_API_ROOT}/${encodeURIComponent(crateName)}/versions`, {
    headers: {
      'user-agent': CRATES_IO_USER_AGENT,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to query crates.io for ${crateName}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const latestVersion = (payload?.versions ?? [])
    .filter((version) => version?.yanked !== true)
    .map((version) => ({
      raw: typeof version?.num === 'string' ? version.num.trim() : '',
      parsed: parseSimpleRustVersion(version?.num),
    }))
    .filter((version) => version.raw.length > 0 && version.parsed)
    .filter((version) => !version.raw.includes('-'))
    .filter((version) => isCompatibleRustVersion(currentVersion, version.parsed))
    .sort((left, right) => compareSimpleRustVersions(right.parsed, left.parsed))[0]?.raw ?? null;

  if (typeof latestVersion !== 'string' || latestVersion.trim().length === 0) {
    throw new Error(
      `crates.io did not provide a usable compatible version for ${crateName} within the ${currentVersion.major}.${currentVersion.minor} lane.`
    );
  }

  versionCache.set(cacheKey, latestVersion.trim());
  return latestVersion.trim();
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

async function discoverRustTarget() {
  const backendDirectoryPath = path.join(ROOT_DIR, BACKEND_DIRNAME);
  const cargoManifestPath = path.join(backendDirectoryPath, CARGO_MANIFEST_FILENAME);

  if (!existsSync(cargoManifestPath)) {
    return null;
  }

  const manifestText = await readFile(cargoManifestPath, 'utf8');
  const dependencyEntries = collectRustDependencyEntries(manifestText);

  return {
    dir: backendDirectoryPath,
    cargoManifestPath,
    cargoManifestLabel:
      path.relative(ROOT_DIR, cargoManifestPath) || CARGO_MANIFEST_FILENAME,
    cargoLockPath: path.join(backendDirectoryPath, CARGO_LOCK_FILENAME),
    dependencyEntries,
    dependencyCounts: collectRustDependencyCounts(dependencyEntries),
    beforeManifestText: manifestText,
  };
}

async function runPnpmUpgrade(target, options = {}) {
  const runPnpmCommand = createPnpmExecutor(target);

  if (!options.repairOnly) {
    await runPnpmCommand(['up', '--latest', ...target.dependencyNames]);
  }

  const nextManifest = await readManifest(target.packageJsonPath);
  const overrideChanges = normalizePnpmOverrides(nextManifest);

  if (overrideChanges.length > 0) {
    await rewriteManifest(target.packageJsonPath, nextManifest);
    console.log(
      `  - Normalized ${overrideChanges.length} overlapping pnpm override${overrideChanges.length === 1 ? '' : 's'} to $dependency references.`
    );
  }

  await runPnpmCommand(['install', '--lockfile-only']);
}

async function runRustUpgrade(target) {
  const newline = target.beforeManifestText.includes('\r\n') ? '\r\n' : '\n';
  const manifestLines = target.beforeManifestText.split(/\r?\n/);
  const latestVersionCache = new Map();
  let updatedRangeCount = 0;
  let skippedRangeCount = 0;

  for (const dependencyEntry of target.dependencyEntries) {
    const latestVersion = await fetchLatestCompatibleCrateVersion(
      dependencyEntry.crateName,
      dependencyEntry.versionSpec,
      latestVersionCache
    );
    if (!latestVersion) {
      skippedRangeCount += 1;
      continue;
    }

    const nextVersionSpec = buildLatestRustVersionSpec(
      dependencyEntry.versionSpec,
      latestVersion
    );

    if (!nextVersionSpec) {
      skippedRangeCount += 1;
      continue;
    }

    if (nextVersionSpec === dependencyEntry.versionSpec) {
      continue;
    }

    manifestLines[dependencyEntry.lineIndex] = dependencyEntry.updateLine(nextVersionSpec);
    updatedRangeCount += 1;
  }

  if (updatedRangeCount > 0) {
    await writeFile(target.cargoManifestPath, manifestLines.join(newline));
    console.log(`  - Updated ${updatedRangeCount} Cargo.toml dependency ranges to the newest published versions.`);
  } else {
    console.log('  - Cargo.toml dependency ranges are already current or do not need rewriting.');
  }

  if (skippedRangeCount > 0) {
    console.log(`  - Skipped ${skippedRangeCount} Cargo dependency entries with unsupported version syntax.`);
  }

  const args = ['update'];
  printAction(target.dir, 'cargo', args);

  await new Promise((resolve, reject) => {
    const child = spawn(CARGO_COMMAND, args, {
      cwd: target.dir,
      stdio: 'inherit',
      env: process.env,
      shell: IS_WINDOWS,
      windowsHide: true,
    });

    child.on('error', (error) => {
      reject(createSpawnError('cargo', target.dir, error));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `cargo exited abnormally for ${target.cargoManifestLabel}: ${signal ? `signal ${signal}` : `code ${code}`}`
        )
      );
    });
  });
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

async function verifyRustTarget(target) {
  const nextManifestText = await readFile(target.cargoManifestPath, 'utf8');
  const nextDependencyEntries = collectRustDependencyEntries(nextManifestText);
  const changedRanges = collectRustRangeChanges(
    target.dependencyEntries,
    nextDependencyEntries
  );
  const lockfileExists = existsSync(target.cargoLockPath);
  const lockfileLabel = lockfileExists
    ? path.relative(ROOT_DIR, target.cargoLockPath)
    : '<no local Cargo.lock>';

  console.log(
    `[ok] ${target.cargoManifestLabel} -> ${target.dependencyEntries.length} dependencies inspected, ${changedRanges.length} ranges updated, lockfile: ${lockfileLabel}`
  );

  if (changedRanges.length > 0) {
    const preview = changedRanges.slice(0, 10).map(formatRustChange);
    preview.forEach((line) => console.log(`  - ${line}`));

    if (changedRanges.length > preview.length) {
      console.log(`  - ... ${changedRanges.length - preview.length} more`);
    }
  } else {
    console.log('  - Already at the newest published ranges or no manifest rewrite was necessary.');
  }
}

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  printHeader(
    cliArgs.repairOnly
      ? 'Repair Dependabot Dependency State'
      : 'Upgrade Package Dependencies For Dependabot'
  );

  const pnpmTargets = await discoverTargets();
  const rustTarget = await discoverRustTarget();
  const includeRustTarget = !cliArgs.repairOnly && rustTarget;
  const totalTargets = pnpmTargets.length + (includeRustTarget ? 1 : 0);

  if (totalTargets === 0) {
    throw new Error('No package.json with dependencies or backend/Cargo.toml was found under the repository root.');
  }

  console.log(`Repository root: ${ROOT_DIR}`);
  console.log(`Targets: ${totalTargets}`);
  console.log(`Mode: ${cliArgs.repairOnly ? 'repair-only' : 'upgrade'}`);

  for (const target of pnpmTargets) {
    console.log(
      `- ${target.packageJsonLabel} (${describeCounts(target.dependencyCounts)})`
    );
  }

  if (includeRustTarget) {
    console.log(
      `- ${rustTarget.cargoManifestLabel} (${describeRustCounts(rustTarget.dependencyCounts) || 'no versioned rust dependencies'})`
    );
  }

  for (const [index, target] of pnpmTargets.entries()) {
    printSection(
      index + 1,
      totalTargets,
      `${cliArgs.repairOnly ? 'repair' : 'upgrade'} ${target.packageJsonLabel}`
    );
    await runPnpmUpgrade(target, cliArgs);
    await verifyTarget(target);
  }

  if (includeRustTarget) {
    printSection(
      pnpmTargets.length + 1,
      totalTargets,
      `upgrade ${rustTarget.cargoManifestLabel}`
    );
    await runRustUpgrade(rustTarget);
    await verifyRustTarget(rustTarget);
  }

  console.log('\nDone.');
}

main().catch((error) => {
  console.error(`\n[failed] ${error.message}`);
  process.exitCode = 1;
});
