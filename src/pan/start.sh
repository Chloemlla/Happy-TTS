#!/bin/bash

# Pan Admin 启动脚本

echo "🚀 启动 Pan Admin 系统..."

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装，请先安装 npm"
    exit 1
fi

# 检查MongoDB是否运行
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB 未运行，请先启动 MongoDB 服务"
    echo "   启动命令: sudo systemctl start mongod"
    echo "   或者: brew services start mongodb-community"
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "📝 创建环境变量文件..."
    cp env.example .env
    echo "✅ 环境变量文件已创建，请根据需要编辑 .env 文件"
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 检查数据库是否已初始化
echo "🗄️  检查数据库状态..."
if ! npm run init-db &> /dev/null; then
    echo "⚠️  数据库初始化失败，请检查 MongoDB 连接"
    exit 1
fi

# 启动开发服务器
echo "🚀 启动开发服务器..."
npm run dev 