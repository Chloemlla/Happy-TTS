#!/bin/bash
# ============================================================
# Fix Dependabot security alerts
#
# Previous alerts:
# #141 - jspdf: Client-Side/Server-Side DoS via Malicious GIF
#        Upgrade jspdf to >=4.2.0 in frontend (direct dep)
# #144 - minimatch: ReDoS via repeated wildcards
#        Override minimatch >=10.2.1 in frontend/docs
# #149 - minimatch: ReDoS via repeated wildcards
#        Override minimatch >=10.2.1 in root
#
# Current alerts:
# - dompurify: XSS vulnerability (root & frontend)
#   Upgrade to >=3.3.2 in root, >=3.2.7 in frontend
# - serialize-javascript: RCE vulnerability (frontend/docs)
#   Upgrade to >=7.0.3
# - svgo: DoS vulnerability (frontend/docs)
#   Upgrade to >=3.3.3
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Security Vulnerabilities"
echo "=========================================="

# 1. Root — upgrade dompurify, override handles minimatch
echo ""
echo "[1/4] Root: upgrading dompurify, regenerating lockfile..."
pnpm update dompurify --latest
pnpm install --no-frozen-lockfile
echo "✅ Root done"

# 2. frontend — upgrade jspdf & dompurify, override handles minimatch
echo ""
echo "[2/4] frontend: upgrading jspdf & dompurify, regenerating lockfile..."
cd frontend
pnpm update jspdf dompurify --latest
pnpm install --no-frozen-lockfile
cd ..
echo "✅ frontend done"

# 3. frontend/docs — upgrade serialize-javascript & svgo, override handles minimatch
echo ""
echo "[3/4] frontend/docs: upgrading serialize-javascript & svgo, regenerating lockfile..."
cd frontend/docs
pnpm update serialize-javascript svgo --latest
pnpm install --no-frozen-lockfile
cd ../..
echo "✅ frontend/docs done"

# 4. NexAI Auth — install google-auth-library for Google OAuth
echo ""
echo "[4/4] NexAI: Installing google-auth-library for Google OAuth..."
pnpm add google-auth-library
echo "✅ NexAI dependencies done"

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
echo "  Expected fixes:"
echo "  - dompurify upgraded to >=3.3.2 (root)"
echo "  - dompurify upgraded to >=3.2.7 (frontend)"
echo "  - serialize-javascript upgraded to >=7.0.3 (docs)"
echo "  - svgo upgraded to >=3.3.3 (docs)"
echo "=========================================="
