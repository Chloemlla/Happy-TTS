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
# 不使用 --ignore-scripts：Tailwind v4 oxide 与 lightningcss 在 alpine/musl 上依赖
# pnpm 在 install 阶段正确处理 optionalDependencies + onlyBuiltDependencies；
# 强制 ignore-scripts 会导致 oxide 扫描静默失败，最终 CSS 缺失全部 utility classes。
RUN pnpm install --frozen-lockfile

# 再复制源代码
COPY frontend/ .

# 构建前端
RUN pnpm run build

# 校验 Tailwind 工具类已正确生成（防止 oxide 静默失败导致 CSS 只剩第三方库样式）
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
    DOCS_DIST_DIR="/app/docs" \
    OPENAPI_JSON_PATH="/app/openapi.json"

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
RUN npm install -g concurrently

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
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=docs-builder /app/docs/build ./docs

# 非 root 用户运行
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 3001

CMD ["concurrently", "node dist/app.js", "pnpm exec serve -s public -l 3001"]
