#!/usr/bin/env bash
# ============================================================
# Fix current Dependabot alerts reported by audit output.
#
# Current alerts:
# - frontend: lodash via swagger-ui-react
# - frontend/docs: lodash via @docusaurus/core
#
# Target fix:
# - force lodash to a patched version (>=4.18.0)
# - refresh the direct packages that pull lodash in
# - re-run audit for root, frontend, and frontend/docs
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCHED_LODASH_VERSION=">=4.18.0"

print_header() {
  echo "=========================================="
  echo "  Fixing Dependabot Alerts"
  echo "=========================================="
}

print_section() {
  echo ""
  echo "[$1/3] $2"
}

set_lodash_override() {
  local package_json="$1"

  node -e "
const fs = require('fs');
const packageJsonPath = process.argv[1];
const lodashRange = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
pkg.pnpm ||= {};
pkg.pnpm.overrides ||= {};
pkg.pnpm.overrides.lodash = lodashRange;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
" "$package_json" "$PATCHED_LODASH_VERSION"
}

pnpm_update_latest() {
  if ! pnpm update --latest "$@"; then
    pnpm update "$@"
  fi
}

run_audit() {
  local title="$1"
  local dir="$2"

  echo ""
  echo "--- $title ---"
  (
    cd "$dir"
    pnpm audit 2>/dev/null || true
  )
}

print_header

print_section 1 "root: no action required from the current audit output"
echo "Current root audit is clean, skipping dependency changes."
echo "[ok] root"

print_section 2 "frontend: override lodash and refresh swagger-ui-react"
(
  cd "$ROOT_DIR/frontend"
  set_lodash_override "$PWD/package.json"
  pnpm_update_latest swagger-ui-react lodash --depth Infinity
  pnpm install --no-frozen-lockfile
)
echo "[ok] frontend"

print_section 3 "frontend/docs: override lodash and refresh Docusaurus packages"
(
  cd "$ROOT_DIR/frontend/docs"
  set_lodash_override "$PWD/package.json"
  pnpm_update_latest \
    @docusaurus/core \
    @docusaurus/preset-classic \
    @docusaurus/module-type-aliases \
    @docusaurus/tsconfig \
    @docusaurus/types \
    lodash \
    --depth Infinity
  pnpm install --no-frozen-lockfile
)
echo "[ok] frontend/docs"

echo ""
echo "=========================================="
echo "  Audit Results"
echo "=========================================="

run_audit "root" "$ROOT_DIR"
run_audit "frontend" "$ROOT_DIR/frontend"
run_audit "frontend/docs" "$ROOT_DIR/frontend/docs"

echo ""
echo "=========================================="
echo "  Done"
echo "  Updated targets:"
echo "  - frontend -> swagger-ui-react -> lodash"
echo "  - frontend/docs -> @docusaurus/core -> lodash"
echo "  Forced override:"
echo "  - lodash $PATCHED_LODASH_VERSION"
echo "=========================================="
