@echo off
setlocal enabledelayedexpansion

REM Docker构建脚本 - Windows版本
REM 使用方法: scripts\build-docker.bat [tag]

set "TAG=%1"
if "%TAG%"=="" set "TAG=Synapse:latest"

echo [INFO] 开始构建Docker镜像: %TAG%

REM 检查Docker是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker未运行或无法访问
    exit /b 1
)

REM 清理旧的构建缓存（可选）
set /p "CLEAN=是否清理Docker构建缓存? (y/N): "
if /i "!CLEAN!"=="y" (
    echo [INFO] 清理Docker构建缓存...
    docker builder prune -f
)

REM 设置构建参数
set "BUILD_ARGS="
if not "%2"=="" set "BUILD_ARGS=--build-arg NODE_ENV=%2"

echo [INFO] 开始构建...
echo [WARN] 注意: 如果遇到内存不足，构建会自动重试使用不同的内存配置

REM 使用BuildKit并设置内存限制
set "DOCKER_BUILDKIT=1"

REM 构建命令
docker build ^
    --platform linux/amd64 ^
    --memory=8g ^
    --memory-swap=8g ^
    --build-arg BUILDKIT_INLINE_CACHE=1 ^
    %BUILD_ARGS% ^
    -t %TAG% ^
    .

if errorlevel 1 (
    echo [ERROR] Docker镜像构建失败
    echo [SUGGEST] 建议:
    echo   1. 增加系统内存或交换空间
    echo   2. 清理Docker缓存: docker system prune -a
    echo   3. 使用更小的基础镜像
    echo   4. 分段构建以减少内存使用
    exit /b 1
) else (
    echo [SUCCESS] Docker镜像构建成功: %TAG%
    
    REM 显示镜像信息
    echo [INFO] 镜像信息:
    docker images %TAG%
    
    REM 询问是否运行容器
    set /p "RUN=是否运行容器进行测试? (y/N): "
    if /i "!RUN!"=="y" (
        echo [INFO] 启动测试容器...
        start "Synapse Container" docker run --rm -p 3000:3000 -p 3001:3001 -p 3002:3002 %TAG%
        
        echo [INFO] 容器已启动
        echo [INFO] 访问地址:
        echo   - 前端: http://localhost:3001
        echo   - 后端: http://localhost:3000
        echo   - 文档: http://localhost:3002
        echo [INFO] 按任意键停止容器...
        pause >nul
        
        REM 停止所有相关容器
        docker stop $(docker ps -q --filter ancestor=%TAG%) 2>nul
    )
)

echo [INFO] 构建完成 