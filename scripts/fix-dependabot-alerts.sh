#!/bin/bash
# ============================================================
# Fix Dependabot security alerts
# Alerts: #91 #128 #112 #140 #139 #76 #103
#
# Root (pnpm-lock.yaml):
#   - qs 6.14.0 → DoS via arrayLimit bypass (#91 High, #128 Low)
#   - diff 4.0.2 → DoS in parsePatch/applyPatch (#112 Low)
#   - ajv 8.12.0 → ReDoS with $data option (#140 Moderate)
#
# frontend/docs (pnpm-lock.yaml):
#   - nth-check 1.0.2/2.1.1 → ReDoS (#76 High)
#   - ajv 6.12.6 → ReDoS with $data option (#139 Moderate)
#
# frontend (pnpm-lock.yaml):
#   - lodash-es 4.17.21 → Prototype Pollution (#103 Moderate)
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Dependabot Security Alerts"
echo "=========================================="

# ----------------------------------------------------------
# 1. Root: qs (#91 #128), diff (#112), ajv (#140)
# ----------------------------------------------------------
echo ""
echo "[1/3] Root dependencies (qs, diff, ajv)..."
pnpm update qs diff ajv --latest
echo "✅ Root deps updated"

# ----------------------------------------------------------
# 2. frontend/: lodash-es (#103)
# ----------------------------------------------------------
echo ""
echo "[2/3] frontend/ dependencies (lodash-es)..."
cd frontend
pnpm update lodash-es --latest
cd ..
echo "✅ frontend deps updated"

# ----------------------------------------------------------
# 3. frontend/docs/: nth-check (#76), ajv (#139)
# ----------------------------------------------------------
echo ""
echo "[3/3] frontend/docs/ dependencies (nth-check, ajv)..."
cd frontend/docs
pnpm update nth-check ajv --latest
cd ../..
echo "✅ frontend/docs deps updated"

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
