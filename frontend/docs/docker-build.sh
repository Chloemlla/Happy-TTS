#!/bin/bash

# Docker环境下的Docusaurus构建脚本
# 解决Git相关警告问题

set -e

echo "🚀 开始Docker环境下的文档构建..."

# 设置环境变量禁用Git功能
export DISABLE_GIT_INFO=true
export GIT_DISABLED=true
export DOCUSAURUS_DISABLE_GIT_INFO=true
export NODE_ENV=production

echo "📋 环境变量设置:"
echo "  DISABLE_GIT_INFO: $DISABLE_GIT_INFO"
echo "  GIT_DISABLED: $GIT_DISABLED"
echo "  DOCUSAURUS_DISABLE_GIT_INFO: $DOCUSAURUS_DISABLE_GIT_INFO"
echo "  NODE_ENV: $NODE_ENV"

# 清理之前的构建
echo "🧹 清理之前的构建..."
rm -rf build .docusaurus build-simple

# 安装依赖
echo "📦 安装依赖..."
npm ci --only=production

# 尝试构建
echo "🔨 开始构建..."
if npm run build:docker; then
    echo "✅ 构建成功！"
    echo "📁 构建输出目录: build/"
    ls -la build/
else
    echo "⚠️  第一次构建失败，尝试简化构建..."
    if npm run build:simple; then
        echo "✅ 简化构建成功！"
        echo "📁 构建输出目录: build-simple/"
        ls -la build-simple/
    else
        echo "❌ 所有构建方式都失败了"
        exit 1
    fi
fi

echo "🎉 构建完成！" 