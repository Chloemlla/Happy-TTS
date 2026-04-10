#!/usr/bin/env bash
# Fix the current frontend Dependabot alerts.
#
# Alerts covered by this script:
# - GHSA-3p68-rc4w-qgx5 / Axios NO_PROXY Hostname Normalization Bypass
# - GHSA-p9ff-h696-f583 / CVE-2026-39363
# - GHSA-v2wj-q39q-566r / CVE-2026-39364
# - GHSA-4w7w-66w2-5vf9 / CVE-2026-39365
#
# GitHub is flagging the direct frontend axios dependency plus both the
# direct frontend Vite dependency and the transitive Vite copy pulled in by
# Vitest. This script pins the frontend package manifest and local lockfile to
# safe minimum versions, without touching the workspace root lockfile.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

PATCHED_AXIOS_FLOOR="1.15.0"
PATCHED_VITE_FLOOR="8.0.5"
PATCHED_VITEST_FLOOR="4.1.0"

print_header() {
  printf '%s\n' '=========================================='
  printf '%s\n' '  Fixing Dependabot Alerts'
  printf '%s\n' '=========================================='
}

print_section() {
  printf '\n[%s/3] %s\n' "$1" "$2"
}

run_in_frontend() {
  printf 'PS %s> %s\n' "$FRONTEND_DIR" "$*"
  (
    cd "$FRONTEND_DIR"
    "$@"
  )
}

update_frontend_manifest() {
  node - "$FRONTEND_DIR/package.json" "$PATCHED_AXIOS_FLOOR" "$PATCHED_VITE_FLOOR" "$PATCHED_VITEST_FLOOR" <<'NODE'
const fs = require('node:fs');

const [packageJsonPath, axiosFloor, viteFloor, vitestFloor] = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.dependencies = packageJson.dependencies || {};
packageJson.devDependencies = packageJson.devDependencies || {};

packageJson.dependencies.axios = `^${axiosFloor}`;
packageJson.devDependencies.vite = `^${viteFloor}`;
packageJson.devDependencies.vitest = `^${vitestFloor}`;
packageJson.devDependencies['@vitest/ui'] = `^${vitestFloor}`;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
NODE
}

verify_versions() {
  node - "$FRONTEND_DIR/pnpm-lock.yaml" "$PATCHED_AXIOS_FLOOR" "$PATCHED_VITE_FLOOR" "$PATCHED_VITEST_FLOOR" <<'NODE'
const fs = require('node:fs');

const [lockfilePath, axiosFloor, viteFloor, vitestFloor] = process.argv.slice(2);
const lockfile = fs.readFileSync(lockfilePath, 'utf8');

function compareVersions(a, b) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const left = aParts[index] ?? 0;
    const right = bParts[index] ?? 0;

    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

function collectVersions(prefix) {
  const expression = new RegExp(`^  ${prefix}@(\\d+\\.\\d+\\.\\d+)(?:\\([^\\n]+\\))?:$`, 'gm');
  const versions = [];
  let match;

  while ((match = expression.exec(lockfile)) !== null) {
    versions.push(match[1]);
  }

  return [...new Set(versions)];
}

const axiosVersions = collectVersions('axios');
const viteVersions = collectVersions('vite');
const vitestVersions = collectVersions('vitest');

if (axiosVersions.length === 0) {
  console.error('axios was not found in frontend/pnpm-lock.yaml');
  process.exit(1);
}

if (viteVersions.length === 0) {
  console.error('vite was not found in frontend/pnpm-lock.yaml');
  process.exit(1);
}

if (vitestVersions.length === 0) {
  console.error('vitest was not found in frontend/pnpm-lock.yaml');
  process.exit(1);
}

const vulnerableAxios = axiosVersions.filter((version) => compareVersions(version, axiosFloor) < 0);
const vulnerableVite = viteVersions.filter((version) => compareVersions(version, viteFloor) < 0);
const vulnerableVitest = vitestVersions.filter((version) => compareVersions(version, vitestFloor) < 0);

if (vulnerableAxios.length > 0) {
  console.error(`Found vulnerable axios versions: ${vulnerableAxios.join(', ')}`);
  process.exit(1);
}

if (vulnerableVite.length > 0) {
  console.error(`Found vulnerable vite versions: ${vulnerableVite.join(', ')}`);
  process.exit(1);
}

if (vulnerableVitest.length > 0) {
  console.error(`Found outdated vitest versions: ${vulnerableVitest.join(', ')}`);
  process.exit(1);
}

console.log(`Resolved axios versions: ${axiosVersions.join(', ')}`);
console.log(`Resolved vite versions: ${viteVersions.join(', ')}`);
console.log(`Resolved vitest versions: ${vitestVersions.join(', ')}`);
NODE
}

print_header

print_section 1 "pin frontend axios, vite, and vitest package ranges to patched floors"
update_frontend_manifest
run_in_frontend pnpm install --lockfile-only --ignore-workspace
printf '%s\n' '[ok] frontend packages refreshed'

print_section 2 "verify the frontend lockfile only contains patched axios, vite, and vitest releases"
verify_versions
printf '%s\n' '[ok] lockfile versions verified'

print_section 3 "run frontend audit"
run_in_frontend pnpm audit
printf '%s\n' '[ok] frontend audit is clean'

printf '\n%s\n' '=========================================='
printf '%s\n' '  Done'
printf '%s\n' '  Updated targets:'
printf '%s\n' '  - frontend -> axios (direct)'
printf '%s\n' '  - frontend -> vite (direct)'
printf '%s\n' '  - frontend -> vitest -> vite (transitive)'
printf '%s\n' "  Minimum safe axios floor: $PATCHED_AXIOS_FLOOR"
printf '%s\n' "  Minimum safe vite floor: $PATCHED_VITE_FLOOR"
printf '%s\n' "  Minimum expected vitest floor: $PATCHED_VITEST_FLOOR"
printf '%s\n' '=========================================='
