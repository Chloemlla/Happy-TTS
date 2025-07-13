#!/bin/bash

echo "🔧 智能修复 Rollup 依赖问题..."

# 检测平台和 libc 类型
PLATFORM=$(uname -m)
LIBC_TYPE="unknown"

if [[ "$PLATFORM" == "x86_64" ]]; then
    if command -v ldd >/dev/null 2>&1; then
        LDD_OUTPUT=$(ldd --version 2>/dev/null | head -1)
        if [[ "$LDD_OUTPUT" == *"musl"* ]]; then
            LIBC_TYPE="musl"
        elif [[ "$LDD_OUTPUT" == *"glibc"* ]] || [[ "$LDD_OUTPUT" == *"GNU"* ]]; then
            LIBC_TYPE="gnu"
        fi
    fi
    
    # 在 Alpine Linux 中，默认是 musl
    if [[ -f /etc/alpine-release ]]; then
        LIBC_TYPE="musl"
    fi
fi

echo "检测到平台: $PLATFORM, libc: $LIBC_TYPE"

# 清理缓存和依赖
echo "清理缓存和依赖..."
rm -rf node_modules package-lock.json
npm cache clean --force

# 设置环境变量
export NODE_OPTIONS="--max-old-space-size=4096"
export NPM_CONFIG_CACHE="/tmp/.npm"

# 安装基础依赖
echo "安装基础依赖..."
npm install --no-optional --no-audit --no-fund

# 根据平台安装正确的 Rollup 依赖
if [[ "$PLATFORM" == "x86_64" ]]; then
    if [[ "$LIBC_TYPE" == "musl" ]]; then
        echo "安装 musl 版本的 Rollup 依赖..."
        npm install @rollup/rollup-linux-x64-musl --save-dev || echo "Rollup musl dependency installation failed, continuing..."
    elif [[ "$LIBC_TYPE" == "gnu" ]]; then
        echo "安装 gnu 版本的 Rollup 依赖..."
        npm install @rollup/rollup-linux-x64-gnu --save-dev || echo "Rollup gnu dependency installation failed, continuing..."
    else
        echo "无法确定 libc 类型，尝试安装 musl 版本..."
        npm install @rollup/rollup-linux-x64-musl --save-dev || echo "Rollup musl dependency installation failed, continuing..."
    fi
else
    echo "非 x64 平台，跳过原生 Rollup 依赖"
fi

# 安装其他缺失的依赖
echo "安装其他缺失的依赖..."
npm install @fingerprintjs/fingerprintjs@^4.2.0 crypto-js@^4.2.0 --save
npm install @testing-library/react@^14.2.1 --save-dev

echo "✅ Rollup 依赖修复完成！" 