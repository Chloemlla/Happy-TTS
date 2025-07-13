#!/bin/bash

echo "🔧 修复 Rollup 依赖问题..."

# 检查是否在 Linux 环境下
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "📋 检测到 Linux 环境，正在修复 Rollup 依赖..."
    
    # 删除 node_modules 和 package-lock.json
    echo "🗑️  删除 node_modules 和 package-lock.json..."
    rm -rf node_modules
    rm -f package-lock.json
    
    # 清理 npm 缓存
    echo "🧹 清理 npm 缓存..."
    npm cache clean --force
    
    # 重新安装依赖
    echo "📦 重新安装依赖..."
    npm install
    
    # 特别安装 Rollup 的 Linux 依赖
    echo "🔧 安装 Rollup Linux 依赖..."
    npm install @rollup/rollup-linux-x64-gnu --save-dev
    
    echo "✅ 修复完成！"
else
    echo "ℹ️  非 Linux 环境，跳过修复..."
fi 