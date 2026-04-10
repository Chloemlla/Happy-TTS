#!/usr/bin/env bash
# Fix the current frontend Vite Dependabot alerts.
#
# Alerts covered by this script:
# - GHSA-p9ff-h696-f583 / CVE-2026-39363
# - GHSA-v2wj-q39q-566r / CVE-2026-39364
# - GHSA-4w7w-66w2-5vf9 / CVE-2026-39365
#
# GitHub is flagging both the direct frontend Vite dependency and the
# transitive Vite copy pulled in by Vitest. Refreshing the frontend lockfile
# within the existing semver ranges is enough because:
# - vite ^8.0.3 resolves to a patched 8.0.5+ release
# - vitest / @vitest/ui ^4.0.6 resolve to patched 4.1.x releases

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

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

verify_versions() {
  node - "$FRONTEND_DIR/pnpm-lock.yaml" "$PATCHED_VITE_FLOOR" "$PATCHED_VITEST_FLOOR" <<'NODE'
const fs = require('node:fs');

const [lockfilePath, viteFloor, vitestFloor] = process.argv.slice(2);
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
  const expression = new RegExp(`^  ${prefix}@(\\d+\\.\\d+\\.\\d+):$`, 'gm');
  const versions = [];
  let match;

  while ((match = expression.exec(lockfile)) !== null) {
    versions.push(match[1]);
  }

  return [...new Set(versions)];
}

const viteVersions = collectVersions('vite');
const vitestVersions = collectVersions('vitest');

if (viteVersions.length === 0) {
  console.error('vite was not found in frontend/pnpm-lock.yaml');
  process.exit(1);
}

if (vitestVersions.length === 0) {
  console.error('vitest was not found in frontend/pnpm-lock.yaml');
  process.exit(1);
}

const vulnerableVite = viteVersions.filter((version) => compareVersions(version, viteFloor) < 0);
const vulnerableVitest = vitestVersions.filter((version) => compareVersions(version, vitestFloor) < 0);

if (vulnerableVite.length > 0) {
  console.error(`Found vulnerable vite versions: ${vulnerableVite.join(', ')}`);
  process.exit(1);
}

if (vulnerableVitest.length > 0) {
  console.error(`Found outdated vitest versions: ${vulnerableVitest.join(', ')}`);
  process.exit(1);
}

console.log(`Resolved vite versions: ${viteVersions.join(', ')}`);
console.log(`Resolved vitest versions: ${vitestVersions.join(', ')}`);
NODE
}

print_header

print_section 1 "refresh frontend vite and vitest packages inside existing ranges"
run_in_frontend pnpm update vite vitest @vitest/ui --depth Infinity
run_in_frontend pnpm install --no-frozen-lockfile
printf '%s\n' '[ok] frontend packages refreshed'

print_section 2 "verify the lockfile only contains patched vite and vitest releases"
verify_versions
printf '%s\n' '[ok] lockfile versions verified'

print_section 3 "run frontend audit"
run_in_frontend pnpm audit
printf '%s\n' '[ok] frontend audit is clean'

printf '\n%s\n' '=========================================='
printf '%s\n' '  Done'
printf '%s\n' '  Updated targets:'
printf '%s\n' '  - frontend -> vite (direct)'
printf '%s\n' '  - frontend -> vitest -> vite (transitive)'
printf '%s\n' "  Minimum safe vite floor: $PATCHED_VITE_FLOOR"
printf '%s\n' "  Minimum expected vitest floor: $PATCHED_VITEST_FLOOR"
printf '%s\n' '=========================================='
