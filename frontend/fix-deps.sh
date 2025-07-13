#!/bin/bash

echo "🔧 修复前端依赖问题..."

# 清理缓存和依赖
echo "清理缓存和依赖..."
rm -rf node_modules package-lock.json
npm cache clean --force

# 设置环境变量
export NODE_OPTIONS="--max-old-space-size=4096"
export NPM_CONFIG_CACHE="/tmp/.npm"

# 安装依赖
echo "安装依赖..."
npm install --no-optional --no-audit --no-fund

# 特别安装缺失的依赖
echo "安装缺失的依赖..."
npm install @fingerprintjs/fingerprintjs@^4.2.0 crypto-js@^4.2.0 --save
npm install @testing-library/react@^14.2.1 --save-dev

# 安装 Rollup 依赖
echo "安装 Rollup 依赖..."
npm install @rollup/rollup-linux-x64-gnu --save-dev || echo "Rollup Linux dependency installation failed, continuing..."

echo "✅ 依赖修复完成！" 