#!/bin/bash

# Synapse 文件存储模式启动脚本

echo "=== Synapse 文件存储模式启动脚本 ==="
echo "此脚本将使用文件存储模式启动应用"
echo ""

# 设置环境变量
export USER_STORAGE_MODE=file
export NODE_ENV=production

echo "已设置环境变量:"
echo "  USER_STORAGE_MODE=$USER_STORAGE_MODE"
echo "  NODE_ENV=$NODE_ENV"
echo ""

# 检查必要目录
echo "检查必要目录..."
mkdir -p data
mkdir -p logs
mkdir -p finish

echo "✅ 目录检查完成"
echo ""

# 启动应用
echo "启动 Synapse 应用..."
echo "使用文件存储模式，无需数据库连接"
echo ""

# 如果是开发环境，使用 npm run dev
if [ "$1" = "dev" ]; then
    echo "启动开发模式..."
    npm run dev
else
    echo "启动生产模式..."
    npm start
fi 