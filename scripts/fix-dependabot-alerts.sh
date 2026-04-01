#!/bin/bash
# ============================================================
# Fix Dependabot security alerts and dependency updates
#
# Current alerts:
# - handlebars: JavaScript Injection / AST Type Confusion
# - flatted: Prototype Pollution / DoS in parse()
# - undici: Unhandled Exception / DoS / HTTP Request Smuggling
# - picomatch: ReDoS via extglob quantifiers
# - brace-expansion: Zero-step sequence causes process hang 
# - path-to-regexp: ReDoS and Denial of Service
# - serialize-javascript: CPU Exhaustion via crafted array-like objects
#
# Dependabot Alert Locations:
# - Root: handlebars, undici, picomatch, brace-expansion, path-to-regexp
# - frontend: flatted, picomatch, brace-expansion
# - frontend/docs: picomatch, brace-expansion, path-to-regexp, serialize-javascript
# ============================================================
set -e

echo "=========================================="
echo "  Fixing Security Vulnerabilities"
echo "  and Updating Dependencies"
echo "=========================================="

# 1. Root
echo ""
echo "[1/3] Root: upgrading vulnerable packages..."
pnpm update handlebars undici picomatch brace-expansion path-to-regexp --depth Infinity || pnpm update handlebars undici picomatch brace-expansion path-to-regexp
pnpm install --no-frozen-lockfile
echo "✅ Root done"

# 2. frontend
echo ""
echo "[2/3] frontend: upgrading vulnerable packages and installing markdown plugins..."
cd frontend
pnpm update flatted picomatch brace-expansion --depth Infinity || pnpm update flatted picomatch brace-expansion
echo "Installing react-markdown and plugins..."
pnpm add react-markdown react-syntax-highlighter remark-gfm remark-math rehype-katex
pnpm add -D @types/react-syntax-highlighter
pnpm install --no-frozen-lockfile
cd ..
echo "✅ frontend done"

# 3. frontend/docs
echo ""
echo "[3/3] frontend/docs: upgrading vulnerable packages..."
cd frontend/docs
pnpm update picomatch brace-expansion path-to-regexp serialize-javascript --depth Infinity || pnpm update picomatch brace-expansion path-to-regexp serialize-javascript
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
echo "  Security fixes updated:"
echo "  - handlebars (root)"
echo "  - flatted (frontend)"
echo "  - undici (root)"
echo "  - picomatch (root, frontend, frontend/docs)"
echo "  - brace-expansion (root, frontend, frontend/docs)"
echo "  - path-to-regexp (root, frontend/docs)"
echo "  - serialize-javascript (frontend/docs)"
echo "=========================================="
