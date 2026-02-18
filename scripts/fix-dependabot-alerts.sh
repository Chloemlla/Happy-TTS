#!/bin/bash
# ============================================================
# Fix Dependabot security alerts via pnpm overrides + bumps
# Alerts: #91 #128 #112 #140 #139 #76 #103
#
# Strategy: transitive deps use pnpm.overrides (already in
# package.json), direct deps use pnpm update. Then reinstall
# to regenerate lockfiles.
#
# Root (pnpm-lock.yaml):
#   - qs >=6.14.2  (express>qs)           #91 High, #128 Low
#   - diff >=4.0.4 (ts-node>diff)         #112 Low
#   - ajv >=8.18.0 (serve>ajv)            #140 Moderate
#
# frontend (pnpm-lock.yaml):
#   - lodash-es >=4.17.23 (mermaid>...)   #103 Moderate
#   - tailwind-merge 3.4.0 → 3.4.1       bump direct dep
#
# frontend/docs (pnpm-lock.yaml):
#   - nth-check >=2.0.1 (css-select>...)  #76 High
#   - ajv >=8.18.0 (schema-utils>ajv)     #139 Moderate
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Dependabot Security Alerts"
echo "=========================================="

# 1. Root — overrides handle qs, ajv, diff
echo ""
echo "[1/3] Root: regenerating lockfile with overrides..."
pnpm install --no-frozen-lockfile
echo "✅ Root done"

# 2. frontend — override handles lodash-es, bump tailwind-merge
echo ""
echo "[2/3] frontend: bump tailwind-merge, regenerate lockfile..."
cd frontend
pnpm update tailwind-merge --latest
pnpm install --no-frozen-lockfile
cd ..
echo "✅ frontend done"

# 3. frontend/docs — overrides handle nth-check, ajv
echo ""
echo "[3/3] frontend/docs: regenerating lockfile with overrides..."
cd frontend/docs
pnpm install --no-frozen-lockfile
cd ../..
echo "✅ frontend/docs done"

# Verify
echo ""
echo "=========================================="
echo "  Audit Results"
echo "=========================================="
echo ""
echo "--- root ---"
pnpm audit 2>/dev/null || true
echo ""
echo "--- frontend ---"
cd frontend && pnpm audit 2>/dev/null || true && cd ..
echo ""
echo "--- frontend/docs ---"
cd frontend/docs && pnpm audit 2>/dev/null || true && cd ../..

echo ""
echo "=========================================="
echo "  Done. Review audit output above."
echo "=========================================="
