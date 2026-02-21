#!/bin/bash
# ============================================================
# Fix Dependabot security alerts #141 #144 #149
#
# #141 - jspdf: Client-Side/Server-Side DoS via Malicious GIF
#        Upgrade jspdf to >=4.2.0 in frontend (direct dep)
#
# #144 - minimatch: ReDoS via repeated wildcards
#        Override minimatch >=10.2.1 in frontend/docs
#
# #149 - minimatch: ReDoS via repeated wildcards
#        Override minimatch >=10.2.1 in root
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Dependabot Alerts #141 #144 #149"
echo "=========================================="

# 1. Root — override handles minimatch
echo ""
echo "[1/3] Root: regenerating lockfile with overrides..."
pnpm install --no-frozen-lockfile
echo "✅ Root done"

# 2. frontend — upgrade jspdf, override handles minimatch
echo ""
echo "[2/3] frontend: upgrading jspdf, regenerating lockfile..."
cd frontend
pnpm update jspdf --latest
pnpm install --no-frozen-lockfile
cd ..
echo "✅ frontend done"

# 3. frontend/docs — override handles minimatch
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
