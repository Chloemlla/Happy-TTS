# ============================================
# Stage 1: Frontend Build
# ============================================
FROM node:24.3.0-alpine AS frontend-builder

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV NODE_OPTIONS="--max-old-space-size=11264"
ENV VITE_BASE_URL="/static/"
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app/frontend

# 利用 Docker 缓存层：先复制依赖声明文件
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./

# 安装依赖（frozen-lockfile 保证一致性）
# 保留 --ignore-scripts：pnpm 11 在 .npmrc 白名单外的包有未批准 build 时会 ERR_PNPM_IGNORED_BUILDS。
# 关键：@tailwindcss/oxide 与 lightningcss 没有 install 生命周期脚本，
# 它们的平台二进制通过 optionalDependencies 自动选择，因此 --ignore-scripts 不影响它们。
RUN pnpm install --frozen-lockfile --ignore-scripts

# 再复制源代码
COPY frontend/ .

# 构建前端
RUN pnpm run build

# 校验 Tailwind 工具类已正确生成（防止 PostCSS 配置错位导致 CSS 只剩第三方库样式）。
# 真因（已修复，9cb53b5）：index.css 中 @config 必须在 @import "tailwindcss" 之后；
# 这一守护用于把任何同类回归立刻在 image build 阶段抛出。
RUN set -eu; \
    cssfile=$(ls dist/assets/css/index.*.css 2>/dev/null | head -1 || true); \
    if [ -z "$cssfile" ]; then \
        echo "ERROR: No dist/assets/css/index.*.css produced" >&2; \
        ls -la dist/assets/ >&2 || true; \
        exit 1; \
    fi; \
    size=$(wc -c < "$cssfile"); \
    tw_hits=$( (grep -oE '\.(flex|grid|bg-[a-z]|text-[a-z]|rounded|shadow|p-[0-9]|m-[0-9])[a-z0-9_-]*\{' "$cssfile" || true) | wc -l); \
    echo "[verify] $cssfile size=$size tailwind_hits=$tw_hits"; \
    if [ "$size" -lt 50000 ] || [ "$tw_hits" -lt 20 ]; then \
        echo "ERROR: Frontend CSS appears to be missing Tailwind utilities (size=$size, hits=$tw_hits)" >&2; \
        head -c 800 "$cssfile" >&2 || true; \
        echo "" >&2; \
        exit 1; \
    fi

# 确保 favicon.ico 存在（占位；运行时后端会将 /favicon.ico 重定向到 CDN）
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

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app/docs

COPY frontend/docs/package.json frontend/docs/pnpm-lock.yaml frontend/docs/.npmrc ./
RUN pnpm install --frozen-lockfile --ignore-script

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
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
RUN npm install -g javascript-obfuscator

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
# 依赖已在仓库清单和 lockfile 中声明，构建阶段不再动态修改依赖图
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

RUN pnpm run build:backend
RUN mkdir -p dist-obfuscated/templates && cp src/templates/*.html dist-obfuscated/templates/
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
    FRONTEND_DIST_DIR="/app/frontend/dist" \
    DOCS_DIST_DIR="/app/docs" \
    OPENAPI_JSON_PATH="/app/openapi.json"

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

# 安装生产依赖
COPY package.json pnpm-lock.yaml .npmrc ./
# 替换原本的 RUN pnpm config set ignore-scripts false && pnpm install --prod --frozen-lockfile
RUN pnpm install --frozen-lockfile --ignore-scripts

# 从构建阶段复制产物
COPY --from=backend-builder /app/dist-obfuscated ./dist
COPY --from=backend-builder /app/openapi.json ./openapi.json
COPY --from=backend-builder /app/openapi.json ./dist/openapi.json
COPY --from=backend-builder /app/scripts/run-node-with-profiling.js ./scripts/run-node-with-profiling.js
COPY --from=backend-builder /app/scripts/run-load-profile-report.js ./scripts/run-load-profile-report.js
COPY --from=backend-builder /app/scripts/profiling-README.md ./scripts/profiling-README.md
# 前端与文档统一由后端 Express 提供：frontend/dist 命中 registerStaticRoutes 的候选路径，
# docs 由 DOCS_DIST_DIR 指向 /app/docs（保持兼容）。
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY --from=docs-builder /app/docs/build ./docs

# 非 root 用户运行
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# 单进程：后端 Express 同时承担 API、前端 SPA、Docusaurus 静态站点。
CMD ["node", "dist/app.js"]
