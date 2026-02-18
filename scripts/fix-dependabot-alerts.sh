#!/bin/bash
# ============================================================
# 一键修复所有 Dependabot 安全告警
# 涉及: #63 #64 #65 #66 #76 #77 #78 #79 #80 #89 #91
#        #103 #104 #105 #110 #112 #118 #119 #120 #121
#        #126 #128 #138 #139 #140
# ============================================================
set -e

echo "=========================================="
echo "  修复 Dependabot 安全告警"
echo "=========================================="

# ----------------------------------------------------------
# 1. 根目录 (pnpm-lock.yaml)
#    - qs (#91 #128) - 升级到最新
#    - ajv (#140) - 升级到最新
#    - diff (#112) - 升级到最新
# ----------------------------------------------------------
echo ""
echo "[1/4] 修复根目录依赖..."
pnpm update qs ajv diff --latest
echo "✅ 根目录依赖已更新"

# ----------------------------------------------------------
# 2. frontend/ (pnpm-lock.yaml)
#    - lodash-es (#103) - 升级到最新
# ----------------------------------------------------------
echo ""
echo "[2/4] 修复 frontend 依赖..."
cd frontend
pnpm update lodash-es --latest
cd ..
echo "✅ frontend 依赖已更新"

# ----------------------------------------------------------
# 3. frontend/docs/ (package-lock.json + pnpm-lock.yaml)
#    - node-forge (#63 #64 #65) - 通过升级 docusaurus
#    - qs (#89 #126)
#    - nth-check (#76)
#    - mdast-util-to-hast (#66 #80)
#    - lodash (#104 #105)
#    - webpack-dev-server (#77 #78) - 已在 package.json 中
#    - webpack (#118 #119 #120 #121)
#    - js-yaml (#79)
#    - ajv (#138 #139)
# ----------------------------------------------------------
echo ""
echo "[3/4] 修复 frontend/docs 依赖..."
cd frontend/docs

# 升级 docusaurus 全家桶（解决 node-forge、nth-check 等传递依赖）
pnpm update @docusaurus/core @docusaurus/preset-classic @docusaurus/module-type-aliases @docusaurus/tsconfig @docusaurus/types --latest

# 直接升级有漏洞的包
pnpm update qs ajv lodash js-yaml mdast-util-to-hast nth-check webpack webpack-dev-server --latest

# 重新生成 package-lock.json
rm -f package-lock.json
npm install --package-lock-only 2>/dev/null || echo "⚠️ npm lockfile 重建跳过（可能无 npm）"

cd ../..
echo "✅ frontend/docs 依赖已更新"

# ----------------------------------------------------------
# 4. Python (requirements.txt)
#    - python-multipart (#110) - 升级到 >=0.0.20
# ----------------------------------------------------------
echo ""
echo "[4/4] 修复 Python 依赖..."
if command -v sed &>/dev/null; then
  sed -i 's/python-multipart==0\.0\.18/python-multipart>=0.0.20/' requirements.txt
  echo "✅ requirements.txt 已更新 python-multipart"
else
  echo "⚠️ 请手动将 requirements.txt 中 python-multipart 升级到 >=0.0.20"
fi

# ----------------------------------------------------------
# 5. 验证
# ----------------------------------------------------------
echo ""
echo "=========================================="
echo "  验证修复结果"
echo "=========================================="
echo ""
echo "--- 根目录 audit ---"
pnpm audit 2>/dev/null || true
echo ""
echo "--- frontend audit ---"
cd frontend && pnpm audit 2>/dev/null || true && cd ..
echo ""
echo "--- frontend/docs audit ---"
cd frontend/docs && pnpm audit 2>/dev/null || true && cd ../..

echo ""
echo "=========================================="
echo "  全部完成！请检查上方 audit 输出"
echo "=========================================="
