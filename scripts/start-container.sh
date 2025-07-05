#!/bin/bash

# 容器启动脚本
# 先执行初始化脚本，然后启动应用

set -e

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 错误处理
handle_error() {
    log "错误: $1" >&2
    exit 1
}

# 设置错误处理
trap 'handle_error "脚本执行失败"' ERR

log "开始容器启动流程..."

# 检查必要的环境变量
if [ -z "$NODE_ENV" ]; then
    export NODE_ENV=production
    log "设置默认环境: $NODE_ENV"
fi

# 检查数据目录
if [ ! -d "/app/data" ]; then
    log "创建数据目录: /app/data"
    mkdir -p /app/data
fi

# 设置数据目录权限
log "设置数据目录权限"
chmod 755 /app/data

# 检查脚本目录
if [ ! -d "/app/scripts" ]; then
    log "错误: 脚本目录不存在: /app/scripts"
    exit 1
fi

# 进入应用目录
cd /app

# 执行初始化脚本
log "执行容器初始化脚本..."
if [ -f "/app/scripts/init-container.js" ]; then
    node /app/scripts/init-container.js
    if [ $? -eq 0 ]; then
        log "初始化脚本执行成功"
    else
        log "警告: 初始化脚本执行失败，但继续启动"
    fi
else
    log "警告: 初始化脚本不存在，跳过初始化"
fi

# 检查应用文件
if [ ! -f "/app/dist/app.js" ]; then
    log "错误: 应用文件不存在: /app/dist/app.js"
    exit 1
fi

# 检查前端文件
if [ ! -d "/app/public" ]; then
    log "警告: 前端文件目录不存在: /app/public"
fi

# 检查文档文件
if [ ! -d "/app/docs" ]; then
    log "警告: 文档文件目录不存在: /app/docs"
fi

# 启动应用
log "启动应用..."
exec npm start 