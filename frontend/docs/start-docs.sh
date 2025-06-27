#!/bin/bash

echo "正在启动 Synapse API 文档服务..."
echo "端口: 3002"
echo "地址: http://localhost:3002"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

cd "$(dirname "$0")"
npm start 