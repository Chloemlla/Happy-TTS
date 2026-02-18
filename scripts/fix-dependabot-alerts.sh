#!/bin/bash
# ============================================================
# Fix Dependabot security alerts via pnpm overrides
# Alerts: #91 #128 #112 #140 #139 #76 #103
#
# All vulnerabilities are in transitive dependencies, so we
# use pnpm.overrides in each package.json to force safe versions,
# then reinstall to regenerate lockfiles.
#
# Root (pnpm-lock.yaml):
#   - qs >=6.14.2  (express>qs)           #91 High, #128 Low
#   - diff >=4.0.4 (ts-node>diff)         #112 Low
#   - ajv >=8.18.0 (serve>ajv)            #140 Moderate
#
# frontend (pnpm-lock.yaml):
#   - lodash-es >=4.17.23 (mermaid>...)   #103 Moderate
#
# frontend/docs (pnpm-lock.yaml):
#   - nth-check >=2.0.1 (css-select>...)  #76 High
#   - ajv >=8.18.0 (schema-utils>ajv)     #139 Moderate
#
# NOTE: pnpm.overrides are already added to each package.json.
#       This script just reinstalls and verifies.
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Dependabot Security Alerts"
echo "=========================================="

echo ""
echo "[1/3] Reinstalling root dependencies..."
pnpm install --no-frozen-lockfile
echo "✅ Root lockfile regenerated"

echo ""
echo "[2/3] Reinstalling frontend dependencies..."
cd frontend
pnpm install --no-frozen-lockfile
cd ..
echo "✅ frontend lockfile regenerated"

echo ""
echo "[3/3] Reinstalling frontend/docs dependencies..."
cd frontend/docs
pnpm install --no-frozen-lockfile
cd ../..
echo "✅ frontend/docs lockfile regenerated"

# ----------------------------------------------------------
# Verify
# ----------------------------------------------------------
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
