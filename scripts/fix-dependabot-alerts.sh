#!/bin/bash
# ============================================================
# Fix Dependabot security alert #141
#
# jspdf: Client-Side/Server-Side DoS via Malicious GIF
# Upgrade jspdf to >=4.2.0 in frontend (direct dependency)
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Dependabot Alert #141 (jspdf)"
echo "=========================================="

echo ""
echo "[1/2] frontend: upgrading jspdf to >=4.2.0..."
cd frontend
pnpm update jspdf --latest
pnpm install --no-frozen-lockfile
cd ..
echo "✅ jspdf upgraded"

echo ""
echo "[2/2] Audit check..."
echo "--- frontend ---"
cd frontend && pnpm audit 2>/dev/null || true && cd ..

echo ""
echo "=========================================="
echo "  Done. Review audit output above."
echo "=========================================="
