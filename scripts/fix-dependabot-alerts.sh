#!/bin/bash
# ============================================================
# Fix Dependabot security alerts and dependency updates
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
#
# Dependabot PRs:
# #478 - lucide-react 0.564.0 → 0.576.0 (frontend)
# #469 - marked-katex-extension 5.1.6 → 5.1.7 (frontend)
# #465 - react-syntax-highlighter 16.1.0 → 16.1.1 (frontend)
# #463 - @types/jsdom 27.0.0 → 28.0.0 (frontend)
# #458 - rollup-plugin-visualizer 6.0.5 → 7.0.0 (frontend dev)
# #454 - swagger-ui-react 5.31.1 → 5.32.0 (frontend)
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Security Vulnerabilities"
echo "  and Updating Dependencies"
echo "=========================================="

# 1. Root — upgrade dompurify, override handles minimatch
echo ""
echo "[1/4] Root: upgrading dompurify, regenerating lockfile..."
pnpm add @simplewebauthn/server
pnpm install --no-frozen-lockfile
echo "✅ Root done"

# # 2. frontend — upgrade security fixes + Dependabot PRs
# echo ""
# echo "[2/4] frontend: upgrading packages..."
# cd frontend
# echo "  - Security: jspdf, dompurify"
# echo "  - Dependabot: lucide-react, marked-katex-extension, react-syntax-highlighter"
# echo "  - Dependabot: @types/jsdom, rollup-plugin-visualizer, swagger-ui-react"
# pnpm update jspdf dompurify lucide-react marked-katex-extension react-syntax-highlighter @types/jsdom rollup-plugin-visualizer swagger-ui-react --latest
# pnpm install --no-frozen-lockfile
# cd ..
# echo "✅ frontend done"

# # 3. frontend/docs — upgrade serialize-javascript & svgo, override handles minimatch
# echo ""
# echo "[3/4] frontend/docs: upgrading serialize-javascript & svgo, regenerating lockfile..."
# cd frontend/docs
# pnpm update serialize-javascript svgo --latest
# pnpm install --no-frozen-lockfile
# cd ../..
# echo "✅ frontend/docs done"

# # 4. NexAI Auth — install google-auth-library for Google OAuth
# echo ""
# echo "[4/4] NexAI: Installing google-auth-library for Google OAuth..."
# pnpm add google-auth-library
# echo "✅ NexAI dependencies done"

# # Verify
# echo ""
# echo "=========================================="
# echo "  Audit Results"
# echo "=========================================="
# echo ""
# echo "--- root ---"
# pnpm audit 2>/dev/null || true
# echo ""
# echo "--- frontend ---"
# cd frontend && pnpm audit 2>/dev/null || true && cd ..
# echo ""
# echo "--- frontend/docs ---"
# cd frontend/docs && pnpm audit 2>/dev/null || true && cd ../..

# echo ""
# echo "=========================================="
# echo "  Done. Review audit output above."
# echo "  Security fixes:"
# echo "  - dompurify upgraded to >=3.3.2 (root)"
# echo "  - dompurify upgraded to >=3.2.7 (frontend)"
# echo "  - serialize-javascript upgraded to >=7.0.3 (docs)"
# echo "  - svgo upgraded to >=3.3.3 (docs)"
# echo ""
# echo "  Dependabot updates (frontend):"
# echo "  - lucide-react 0.564.0 → 0.576.0"
# echo "  - marked-katex-extension 5.1.6 → 5.1.7"
# echo "  - react-syntax-highlighter 16.1.0 → 16.1.1"
# echo "  - @types/jsdom 27.0.0 → 28.0.0"
# echo "  - rollup-plugin-visualizer 6.0.5 → 7.0.0"
# echo "  - swagger-ui-react 5.31.1 → 5.32.0"
# echo "=========================================="
