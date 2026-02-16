# ============================================
# Stage 1: Frontend Build
# ============================================
FROM node:24.3.0-alpine AS frontend-builder

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV NODE_OPTIONS="--max-old-space-size=11264"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app/frontend

# 利用 Docker 缓存层：先复制依赖声明文件
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# 安装依赖（frozen-lockfile 保证一致性）
RUN pnpm install --frozen-lockfile

# 再复制源代码
COPY frontend/ .

# 构建前端
RUN pnpm run build

# 确保 favicon.ico 存在
RUN touch dist/favicon.ico

# ============================================
# Stage 2: Docusaurus Docs Build
# ============================================
FROM node:24.3.0-alpine AS docs-builder

RUN apk add --no-cache tzdata autoconf automake libtool build-base git && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV NODE_OPTIONS="--max-old-space-size=2048" \
    DISABLE_GIT_INFO=true \
    GIT_DISABLED=true \
    DOCUSAURUS_DISABLE_GIT_INFO=true

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app/docs

COPY frontend/docs/package.json frontend/docs/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --no-optional

COPY frontend/docs/ .

# 初始化空 git repo，避免 Docusaurus 读取 git log 时产生大量警告
RUN git config --global user.email "build@docker" && \
    git config --global user.name "Docker Build" && \
    git init && git add -A && git commit -m "init" --allow-empty

RUN pnpm run build:no-git || pnpm run build:docker || pnpm run build:simple

# ============================================
# Stage 3: Backend Build
# ============================================
FROM node:24.3.0-alpine AS backend-builder

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV NODE_OPTIONS="--max-old-space-size=3048"
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g javascript-obfuscator

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

RUN pnpm run build:backend
RUN pnpm run generate:openapi

# ============================================
# Stage 4: Production Runtime
# ============================================
FROM node:24.3.0-alpine

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048" \
    FRONTEND_DIST_DIR="/app/public" \
    OPENAPI_JSON_PATH="/app/openapi.json"

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g concurrently serve

WORKDIR /app

# 安装生产依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# 从构建阶段复制产物
COPY --from=backend-builder /app/dist-obfuscated ./dist
COPY --from=backend-builder /app/openapi.json ./openapi.json
COPY --from=backend-builder /app/openapi.json ./dist/openapi.json
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=docs-builder /app/docs/build ./docs

# 非 root 用户运行
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 3001 3002

CMD ["pnpm", "start"]
