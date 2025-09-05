# 构建前端
FROM node:22-alpine AS frontend-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置Node.js内存限制和优化
ENV NODE_OPTIONS="--max-old-space-size=11264"
ENV NPM_CONFIG_CACHE="/tmp/.npm"
ENV NPM_CONFIG_PREFER_OFFLINE=true
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app

# 首先复制package文件以利用缓存
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend

# 安装前端依赖前，彻底清理依赖和缓存
RUN rm -rf node_modules package-lock.json

# 安装最新npm
RUN npm install -g pnpm@latest

# 修复 Rollup 依赖问题
RUN echo "🔧 修复 Rollup 依赖问题..." && \
    pnpm store prune

# 先安装依赖，根据平台安装合适的 rollup 依赖
RUN pnpm install --no-optional \
    && if [ "$(uname -m)" = "x86_64" ] || [ "$(uname -m)" = "amd64" ]; then \
    echo "x64 platform detected, installing x64 rollup dependencies..." && \
    pnpm install rollup @rollup/rollup-linux-x64-musl --no-optional; \
    elif [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then \
    echo "ARM64 platform detected, skipping platform-specific rollup dependencies..." && \
    pnpm install rollup @rollup/rollup-linux-arm64-musl --no-optional; \
    else \
    echo "Unknown platform, installing generic rollup..." && \
    pnpm install rollup --no-optional; \
    fi \
    || (echo "依赖安装失败，尝试修复..." && rm -rf node_modules package-lock.json && pnpm install --no-optional && pnpm install rollup --no-optional)

RUN pnpm install @fingerprintjs/fingerprintjs --no-optional && \
    pnpm install crypto-js --no-optional && \
    pnpm install --save-dev @types/crypto-js --no-optional
RUN pnpm install -g vitest && \
    pnpm install -g @testing-library/jest-dom && \
    pnpm install -g @testing-library/react && \
    pnpm install -g @testing-library/user-event && \
    pnpm install -g @babel/preset-env && \
    pnpm install -g @babel/preset-react && \
    pnpm install -g @babel/preset-typescript && \
    pnpm install -g @babel/preset-stage-2 && \
    pnpm install -g @babel/preset-stage-3

# 复制前端源代码（这层会在源代码变化时重新构建）
COPY frontend/ .

# 构建前端（增加内存优化和重试机制，修复 Rollup 依赖问题）
RUN pnpm run build \
    || (echo "第一次构建失败，清理缓存后重试..." && rm -rf node_modules/.cache && pnpm run build) \
    || (echo "第二次构建失败，使用简化构建..." && pnpm run build:simple) \
    || (echo "简化构建失败，使用最小构建..." && pnpm run build:minimal) \
    || (echo "所有构建失败，尝试修复依赖（Rollup/Canvg）..." \
        && pnpm install @rollup/rollup-linux-x64-musl --save-dev --no-optional || true \
        && pnpm install canvg --no-optional || true \
        && pnpm run build:minimal)

# 确保favicon.ico存在
RUN touch dist/favicon.ico

# 构建 Docusaurus 文档
FROM node:22-alpine AS docs-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置Node.js内存限制和优化
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NPM_CONFIG_CACHE="/tmp/.npm"
ENV NPM_CONFIG_PREFER_OFFLINE=true
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_OPTIONAL=false
ENV ROLLUP_SKIP_NATIVE_DEPENDENCIES=true
ENV VITE_SKIP_ROLLUP_NATIVE=true
# 禁用Git功能，避免在Docker环境中出现Git相关警告
ENV DISABLE_GIT_INFO=true
ENV GIT_DISABLED=true
ENV DOCUSAURUS_DISABLE_GIT_INFO=true

# 安装编译 gifsicle 所需的系统依赖和git
RUN apk add --no-cache autoconf automake libtool build-base git

WORKDIR /app

# 复制文档源代码
COPY frontend/docs/ ./docs/

# 安装文档依赖并构建
WORKDIR /app/docs
RUN npm install -g pnpm@latest
RUN pnpm store prune && \
    pnpm install --no-optional && \
    (pnpm run build:no-git || (echo "第一次构建失败，重试..." && pnpm run build:docker) || (echo "第二次构建失败，使用简化构建..." && pnpm run build:simple))

# 构建后端
FROM node:22-alpine AS backend-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置Node.js内存限制和优化
ENV NODE_OPTIONS="--max-old-space-size=3048"
ENV NPM_CONFIG_CACHE="/tmp/.npm"
ENV NPM_CONFIG_PREFER_OFFLINE=true
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_OPTIONAL=true

WORKDIR /app

# 首先复制package文件以利用缓存
COPY package*.json ./

# 安装后端依赖（包括开发依赖，因为需要TypeScript编译器）
RUN npm install -g pnpm@latest
RUN pnpm store prune && \
    pnpm install --no-optional && \
    pnpm add -g javascript-obfuscator

# 复制后端源代码和配置文件（这层会在源代码变化时重新构建）
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

# 构建后端（增加重试机制）
RUN pnpm run build:backend || (echo "第一次构建失败，重试..." && pnpm run build:backend)

# 生成 openapi.json
RUN pnpm run generate:openapi

# 生产环境
FROM node:22-alpine

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置环境变量
ENV TZ=Asia/Shanghai
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NPM_CONFIG_OPTIONAL=false
ENV ROLLUP_SKIP_NATIVE_DEPENDENCIES=true
ENV VITE_SKIP_ROLLUP_NATIVE=true
ENV FRONTEND_DIST_DIR="/app/public"
ENV OPENAPI_JSON_PATH="/app/openapi.json"

WORKDIR /app

# 安装pnpm和生产环境依赖（这层会被缓存）
COPY package*.json ./
COPY pnpm-lock.yaml* ./
ENV SHELL=/bin/sh
RUN npm install -g pnpm@latest concurrently serve && \
    if [ -f "pnpm-lock.yaml" ]; then \
        pnpm install --prod --frozen-lockfile; \
    else \
        pnpm install --prod; \
    fi

# 从构建阶段复制文件
COPY --from=backend-builder /app/dist-obfuscated ./dist
RUN rm -rf ./dist-obfuscated
COPY --from=backend-builder /app/openapi.json ./openapi.json
COPY --from=backend-builder /app/openapi.json ./dist/openapi.json
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=docs-builder /app/docs/build ./docs

# 创建运行用户 nodejs 并修正权限，避免找不到用户错误
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# 暴露端口
EXPOSE 3000 3001 3002

# 启动服务
CMD ["pnpm", "start"]