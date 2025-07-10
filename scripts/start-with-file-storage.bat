@echo off
chcp 65001 >nul

echo === Synapse 文件存储模式启动脚本 ===
echo 此脚本将使用文件存储模式启动应用
echo.

REM 设置环境变量
set USER_STORAGE_MODE=file
set NODE_ENV=production

echo 已设置环境变量:
echo   USER_STORAGE_MODE=%USER_STORAGE_MODE%
echo   NODE_ENV=%NODE_ENV%
echo.

REM 检查必要目录
echo 检查必要目录...
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "finish" mkdir finish

echo ✅ 目录检查完成
echo.

REM 启动应用
echo 启动 Synapse 应用...
echo 使用文件存储模式，无需数据库连接
echo.

REM 如果是开发环境，使用 npm run dev
if "%1"=="dev" (
    echo 启动开发模式...
    npm run dev
) else (
    echo 启动生产模式...
    npm start
)

pause 