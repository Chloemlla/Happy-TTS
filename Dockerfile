# ============================================
# Stage 1: Frontend Build
# ============================================
FROM node:24.20.0-alpine AS frontend-builder

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV NODE_OPTIONS="--max-old-space-size=11264"
ENV VITE_BASE_URL="/static/"
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

WORKDIR /app/frontend

# 利用 Docker 缓存层：先复制依赖声明文件
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/.npmrc ./

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
FROM node:24.20.0-alpine AS backend-builder

RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV NODE_OPTIONS="--max-old-space-size=3048"
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# 依赖已在仓库清单和 lockfile 中声明，构建阶段不再动态修改依赖图
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

RUN pnpm run build:backend
RUN mkdir -p dist-obfuscated/templates && cp src/templates/*.html dist-obfuscated/templates/
RUN pnpm run generate:openapi

# ============================================
# Stage 3: Production Runtime
# ============================================
FROM node:24.20.0-alpine

# apk upgrade：基础镜像（node:24.20.0-alpine）构建后 Alpine 仓库可能已发布更新补丁
# （如 openssl 3.5.8-r0），显式升级可消除镜像扫描中残留的 OS 包 CVE。
RUN apk upgrade --no-cache && \
    apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048" \
    FRONTEND_DIST_DIR="/app/frontend/dist" \
    OPENAPI_JSON_PATH="/app/openapi.json"

RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

WORKDIR /app

# 安装生产依赖。--prod 排除 devDependencies（typescript 7.x = typescript-go 原生二进制，
# 携带 Go stdlib/golang.org/x/text 的 11 个扫描 CVE，而运行时 dist/app.js 并不需要它）。
# --ignore-scripts 保持原生模块不构建（与先前一致，应用在部署中已验证可正常运行）。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && \
    # 运行时直接 `node dist/app.js` 启动，不需要任何包管理器。node 基础镜像自带的
    # npm CLI 捆绑 undici@6.27.0 / ip-address@10.2.0 / brace-expansion@5.0.7 /
    # tar@7.5.19（镜像扫描 high/medium CVE），corepack/pnpm 亦仅安装期需要；
    # 一并移除，杜绝该部分 CVE 随构建重新引入。
    rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack \
           /usr/local/bin/pnpm \
           /usr/local/bin/pnpx \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg \
           /root/.cache/node/corepack

# 从构建阶段复制产物
COPY --from=backend-builder /app/dist-obfuscated ./dist
COPY --from=backend-builder /app/openapi.json ./openapi.json
COPY --from=backend-builder /app/openapi.json ./dist/openapi.json
COPY --from=backend-builder /app/scripts/profiling/run-node-with-profiling.js ./scripts/profiling/run-node-with-profiling.js
COPY --from=backend-builder /app/scripts/profiling/run-load-profile-report.js ./scripts/profiling/run-load-profile-report.js
COPY --from=backend-builder /app/scripts/profiling/README.md ./scripts/profiling/README.md
COPY --from=backend-builder /app/scripts/migrations/migrate-admin-to-superadmin.js ./scripts/migrations/migrate-admin-to-superadmin.js
# 前端由后端 Express 提供：frontend/dist 命中 registerStaticRoutes 的候选路径。
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 非 root 用户运行
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Node 作为主进程运行
CMD ["node", "dist/app.js"]