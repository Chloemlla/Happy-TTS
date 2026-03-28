---
title: Docker 内存优化指南
date: 2025-07-07
slug: docker-memory-optimization
tags: [docker, memory, optimization, build]
---

# Docker 内存优化指南

## 问题描述

在构建大型前端项目时，经常会遇到 `JavaScript heap out of memory` 错误，这是因为：

1. **Vite 构建内存消耗大**：现代前端构建工具需要大量内存
2. **代码混淆增加内存使用**：JavaScript 混淆器会显著增加内存消耗
3. **Docker 容器内存限制**：默认 Docker 构建环境内存有限

## 解决方案

### 1. 增加 Node.js 内存限制

在 `frontend/package.json` 中，我们修改了构建脚本：

```json
{
  "scripts": {
    "build": "node --max-old-space-size=8192 ./node_modules/.bin/tsc && node --max-old-space-size=8192 ./node_modules/.bin/vite build",
    "build:simple": "node --max-old-space-size=4096 ./node_modules/.bin/tsc && node --max-old-space-size=4096 ./node_modules/.bin/vite build --mode simple",
    "build:minimal": "node --max-old-space-size=2048 ./node_modules/.bin/tsc && node --max-old-space-size=2048 ./node_modules/.bin/vite build --mode minimal"
  }
}
```

### 2. Dockerfile 优化

在 `Dockerfile` 中添加了：

```dockerfile
# 设置Node.js内存限制
ENV NODE_OPTIONS="--max-old-space-size=8192"

# 构建前端（增加内存优化和重试机制）
RUN npm run build || (echo "第一次构建失败，重试..." && npm run build) || (echo "第二次构建失败，使用简化构建..." && npm run build:simple) || (echo "简化构建失败，使用最小构建..." && npm run build:minimal)
```

### 3. Vite 配置优化

在 `frontend/vite.config.ts` 中：

- 减少 `terser` 的 `passes` 次数
- 禁用 `reportCompressedSize`
- 优化 `esbuild` 配置
- 减少代码分割复杂度

### 4. 构建脚本

提供了多个构建脚本：

#### Linux/macOS

```bash
# 使用优化脚本
./scripts/build-docker.sh

# 或使用npm脚本
npm run docker:build
```

#### Windows

```cmd
# 使用批处理文件
scripts\build-docker.bat

# 或使用npm脚本
npm run docker:build:win
```

#### 简化构建

```bash
# 4GB内存构建
npm run docker:build:simple

# 2GB内存构建
npm run docker:build:minimal
```

## 构建策略

### 渐进式构建

1. **标准构建** (8GB 内存)

   - 完整功能
   - 代码混淆
   - 完整优化

2. **简化构建** (4GB 内存)

   - 基本功能
   - 减少优化
   - 部分混淆

3. **最小构建** (2GB 内存)
   - 核心功能
   - 最小优化
   - 无混淆

### 自动重试机制

Dockerfile 包含自动重试逻辑：

- 第一次失败：重试标准构建
- 第二次失败：使用简化构建
- 第三次失败：使用最小构建

## 系统要求

### 推荐配置

- **内存**: 8GB+
- **CPU**: 4 核心+
- **磁盘**: 10GB 可用空间

### 最低配置

- **内存**: 4GB
- **CPU**: 2 核心
- **磁盘**: 5GB 可用空间

## 故障排除

### 内存不足错误

如果仍然遇到内存不足：

1. **增加系统内存**

   ```bash
   # 检查当前内存
   free -h
   ```

2. **增加交换空间**

   ```bash
   # 创建交换文件
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

3. **清理 Docker 缓存**
   ```bash
   docker system prune -a
   docker builder prune -f
   ```

### 构建失败

如果构建失败：

1. **检查 Docker 版本**

   ```bash
   docker --version
   docker-compose --version
   ```

2. **启用 BuildKit**

   ```bash
   export DOCKER_BUILDKIT=1
   ```

3. **使用分段构建**

   ```bash
   # 先构建基础镜像
   docker build --target frontend-builder -t Synapse:frontend .

   # 再构建完整镜像
   docker build --target backend-builder -t Synapse:latest .
   ```

## 性能优化建议

### 1. 使用多阶段构建

- 分离构建环境和运行环境
- 减少最终镜像大小

### 2. 优化依赖安装

- 使用 `npm ci` 而不是 `npm install`
- 利用 Docker 层缓存

### 3. 代码分割

- 减少单个文件大小
- 优化加载性能

### 4. 缓存策略

- 使用 `.dockerignore` 排除不必要文件
- 合理利用 Docker 缓存层

## 监控和调试

### 构建监控

```bash
# 监控构建过程
docker build --progress=plain .

# 查看构建日志
docker build . 2>&1 | tee build.log
```

### 内存使用监控

```bash
# 监控Docker内存使用
docker stats

# 监控系统内存
htop
```

## 总结

通过以上优化措施，我们成功解决了 Docker 构建时的内存不足问题：

1. ✅ **增加 Node.js 内存限制**
2. ✅ **优化 Vite 构建配置**
3. ✅ **实现渐进式构建策略**
4. ✅ **提供自动重试机制**
5. ✅ **创建便捷的构建脚本**

现在您可以使用以下命令进行构建：

```bash
# 推荐方式
npm run docker:build

# 或直接使用Docker
docker build -t Synapse:latest .
```

如果遇到问题，请参考故障排除部分或使用简化构建模式。
