#!/bin/bash

echo "开始清理所有css-select相关依赖..."

# 清理docs目录
echo "清理frontend/docs目录..."
cd frontend/docs
rm -rf node_modules package-lock.json

# 清理frontend目录
echo "清理frontend目录..."
cd ../..
cd frontend
rm -rf node_modules package-lock.json

# 清理根目录
echo "清理根目录..."
cd ..
rm -rf node_modules package-lock.json

# 清理npm缓存
echo "清理npm缓存..."
npm cache clean --force

echo "所有css-select相关依赖已清理完成"
echo "请重新运行 npm install 来重新安装依赖" 