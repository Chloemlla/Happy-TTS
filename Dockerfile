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
# Stage 2: Backend Build
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
# Stage 3: Rust Network Tools Build
# ============================================
FROM rust:1.85-alpine AS rust-network-tools-builder

RUN apk add --no-cache musl-dev

WORKDIR /app/rust-services

COPY rust-services/ ./

RUN cargo build --release --manifest-path Cargo.toml -p network-tools

# ============================================
# Stage 4: Rust Network Tools Runtime
# ============================================
FROM alpine:3.21 AS rust-network-tools-runtime

RUN apk add --no-cache ca-certificates tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV TZ=Asia/Shanghai \
    RUST_BIND_ADDR=0.0.0.0:4010 \
    RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true

COPY --from=rust-network-tools-builder /app/rust-services/target/release/network-tools /usr/local/bin/network-tools

RUN addgroup -S networktools && adduser -S networktools -G networktools

USER networktools

EXPOSE 4010

CMD ["/usr/local/bin/network-tools"]

# ============================================
# Stage 5: Rust Audio Worker Build
# ============================================
FROM rust:1.85-alpine AS rust-audio-worker-builder

RUN apk add --no-cache musl-dev

WORKDIR /app/rust-services

COPY rust-services/ ./

RUN cargo build --release --manifest-path Cargo.toml -p audio-worker

# ============================================
# Stage 6: Rust Audio Worker Runtime
# ============================================
FROM alpine:3.21 AS rust-audio-worker-runtime

RUN apk add --no-cache ca-certificates tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV TZ=Asia/Shanghai \
    RUST_AUDIO_WORKER_BIND_ADDR=0.0.0.0:4020 \
    RUST_AUDIO_WORKER_MAX_BYTES=20971520

COPY --from=rust-audio-worker-builder /app/rust-services/target/release/audio-worker /usr/local/bin/audio-worker

RUN addgroup -S audioworker && adduser -S audioworker -G audioworker

USER audioworker

EXPOSE 4020

CMD ["/usr/local/bin/audio-worker"]

# ============================================
# Stage 7: Production Runtime
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
    OPENAPI_JSON_PATH="/app/openapi.json" \
    RUST_EMBEDDED_SERVICES_ENABLED=true \
    RUST_NETWORK_TOOLS_URL="http://127.0.0.1:4010" \
    RUST_AUDIO_WORKER_URL="http://127.0.0.1:4020" \
    RUST_NETWORK_TOOLS_BIN="/usr/local/bin/network-tools" \
    RUST_AUDIO_WORKER_BIN="/usr/local/bin/audio-worker"

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
# 前端由后端 Express 提供：frontend/dist 命中 registerStaticRoutes 的候选路径。
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY --from=rust-network-tools-builder /app/rust-services/target/release/network-tools /usr/local/bin/network-tools
COPY --from=rust-audio-worker-builder /app/rust-services/target/release/audio-worker /usr/local/bin/audio-worker

# 非 root 用户运行
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 4010 4020

# Node 作为主进程，同时按配置拉起同容器内 Rust 子进程。
CMD ["node", "dist/app.js"]
