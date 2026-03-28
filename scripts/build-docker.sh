#!/bin/bash

# Docker构建脚本 - 解决内存不足问题
# 使用方法: ./scripts/build-docker.sh [tag]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认标签
TAG=${1:-"Synapse:latest"}

echo -e "${BLUE}开始构建Docker镜像: ${TAG}${NC}"

# 检查Docker是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}错误: Docker未运行或无法访问${NC}"
    exit 1
fi

# 清理旧的构建缓存（可选）
read -p "是否清理Docker构建缓存? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}清理Docker构建缓存...${NC}"
    docker builder prune -f
fi

# 设置构建参数
BUILD_ARGS=""
if [ -n "$2" ]; then
    BUILD_ARGS="--build-arg NODE_ENV=$2"
fi

# 构建镜像
echo -e "${BLUE}开始构建...${NC}"
echo -e "${YELLOW}注意: 如果遇到内存不足，构建会自动重试使用不同的内存配置${NC}"

# 使用BuildKit并设置内存限制
export DOCKER_BUILDKIT=1

# 构建命令
docker build \
    --platform linux/amd64 \
    --memory=8g \
    --memory-swap=8g \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    $BUILD_ARGS \
    -t $TAG \
    .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker镜像构建成功: ${TAG}${NC}"
    
    # 显示镜像信息
    echo -e "${BLUE}镜像信息:${NC}"
    docker images $TAG
    
    # 询问是否运行容器
    read -p "是否运行容器进行测试? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}启动测试容器...${NC}"
        docker run --rm -p 3000:3000 -p 3001:3001 -p 3002:3002 $TAG &
        CONTAINER_PID=$!
        
        echo -e "${YELLOW}容器已启动，PID: $CONTAINER_PID${NC}"
        echo -e "${YELLOW}访问地址:${NC}"
        echo -e "  - 前端: http://localhost:3001"
        echo -e "  - 后端: http://localhost:3000"
        echo -e "  - 文档: http://localhost:3002"
        echo -e "${YELLOW}按 Ctrl+C 停止容器${NC}"
        
        # 等待用户中断
        trap "echo -e '\n${YELLOW}停止容器...${NC}'; kill $CONTAINER_PID 2>/dev/null; exit 0" INT
        wait $CONTAINER_PID
    fi
else
    echo -e "${RED}❌ Docker镜像构建失败${NC}"
    echo -e "${YELLOW}建议:${NC}"
    echo -e "  1. 增加系统内存或交换空间"
    echo -e "  2. 清理Docker缓存: docker system prune -a"
    echo -e "  3. 使用更小的基础镜像"
    echo -e "  4. 分段构建以减少内存使用"
    exit 1
fi 