#!/bin/bash

# Synapse 旧存储入口兼容启动脚本

echo "=== Synapse MongoDB 存储启动脚本 ==="
echo "旧存储入口已改为 MongoDB，用户存储固定使用 MongoDB"
echo ""

# 设置环境变量
export USER_STORAGE_MODE=mongo
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
echo "使用 MongoDB 用户存储，请确保 MONGO_URI 已配置"
echo ""

# 如果是开发环境，使用 npm run dev
if [ "$1" = "dev" ]; then
    echo "启动开发模式..."
    npm run dev
else
    echo "启动生产模式..."
    npm start
fi 
