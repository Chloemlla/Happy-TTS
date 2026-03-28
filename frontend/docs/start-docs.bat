@echo off
echo 正在启动 Synapse API 文档服务...
echo 端口: 6000
echo 地址: http://localhost:6000
echo.
echo 按 Ctrl+C 停止服务
echo.

cd /d "%~dp0"
npm start 