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

# build:backend 的第一步（scripts/generate-admin-spa-paths.js）要从管理面板 loader 表推导
# /admin SPA 路径清单，所以后端阶段必须看得见 adminModules.tsx。只拷这一个文件：生成的清单
# src/generated/adminSpaModulePaths.ts 已入库，其余前端源码在后端阶段没用，整个 frontend/
# 拉进来只会多占一层缓存。缺了它构建会以「找不到管理模块注册表」直接失败（故意不降级，
# 免得清单少页面时线上表现为深链 308 到 API）。
COPY frontend/src/components/admin/adminModules.tsx ./frontend/src/components/admin/adminModules.tsx

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

# media-tool 的外部依赖：B 站下载走 yt-dlp，默认音频模式（--extract-audio --audio-format）
# 与视频模式（--merge-output-format mp4）都要 ffmpeg，ffprobe 亦由 ffmpeg 包提供。
# 不装的话该功能在镜像里 100% 不可用（yt-dlp 不存在 + 探针永远报缺失）；
# 用户侧「语音转文本」走 LASR HTTP 接口，不依赖这两个二进制。
#
# yt-dlp 不走 apk：Alpine 仓库里的版本常年滞后，改为直接取 yt-dlp-master-builds 的
# musllinux 独立二进制（自带解释器，不再需要 python3，也不拉入 python3 的依赖树）。
# 取的是 master 分支的滚动构建（tag 形如 2026.09.16.074918），比官方 release 新，
# 但属于未发布代码：latest 指向的内容会随后续构建变化，同一份 Dockerfile 在不同时间
# 构建出不同镜像；上游若引入与 Alpine musl 不兼容的改动，由本层末尾的 `yt-dlp --version` 兜住。
# 资产名按构建机架构选（本文件不固定 --platform）：x86_64 → yt-dlp_musllinux，aarch64 → yt-dlp_musllinux_aarch64。
# 落点 /usr/local/bin/yt-dlp 即在 PATH 上，沿用设置页「留空自动探测 PATH」的约定。
# YT_DLP_VERSION 默认 latest（该仓库最新构建）；要钉构建、或让这一层重新拉取，用
#   --build-arg YT_DLP_VERSION=2026.09.16.074918
# 注意 Docker 按 URL 缓存层，默认 latest 在缓存命中时不会自动追新构建。
# ca-certificates 是给 openssl 系工具留的系统 CA 库；curl 只在下载期用，装完即卸，避免把它的 CVE 带进运行镜像。
ARG YT_DLP_VERSION=latest
RUN set -eu; \
    apk add --no-cache ffmpeg ca-certificates; \
    apk add --no-cache --virtual .yt-dlp-fetch curl; \
    case "$(uname -m)" in \
      x86_64) asset=yt-dlp_musllinux ;; \
      aarch64) asset=yt-dlp_musllinux_aarch64 ;; \
      *) echo "ERROR: 上游未提供该架构的 musllinux 二进制: $(uname -m)" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/yt-dlp/yt-dlp-master-builds/releases/${YT_DLP_VERSION}/download"; \
    curl -fsSL --retry 3 --retry-delay 2 "$base/$asset" -o "/tmp/$asset"; \
    curl -fsSL --retry 3 --retry-delay 2 "$base/SHA2-256SUMS" -o /tmp/SHA2-256SUMS; \
    awk -v a="$asset" '$2 == a' /tmp/SHA2-256SUMS > /tmp/want.sums; \
    test -s /tmp/want.sums; \
    ( cd /tmp && sha256sum -c want.sums ); \
    cp "/tmp/$asset" /usr/local/bin/yt-dlp; \
    chmod 0755 /usr/local/bin/yt-dlp; \
    rm -f "/tmp/$asset" /tmp/SHA2-256SUMS /tmp/want.sums; \
    apk del .yt-dlp-fetch; \
    yt-dlp --version

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
COPY --from=backend-builder /app/scripts/migrations/backfill-lumen-ttl.js ./scripts/migrations/backfill-lumen-ttl.js
# 前端由后端 Express 提供：frontend/dist 命中 registerStaticRoutes 的候选路径。
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 非 root 用户运行
# /app/data 是 media-tool 工作根（resolveRootDir 兜底 <cwd>/data/media-tool）、
# tamper/modlist/userGeneration 等落盘目录的共同根。它必须在 chown -R 之前建出来，
# 否则命名卷首次挂载时拿不到 nodejs 属主，非 root 进程写不进去。
# 注意：docker-compose 用的是 bind mount（./data:/app/data），宿主机目录的属主会覆盖
# 镜像里的设置，需要宿主自行 `chown 100:100 ./data`（或改用命名卷）。
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# 存活探测：/health 由 src/routes/healthRoutes.ts 提供（含 Mongo/WebSocket 状态）。
# 端口取 PORT 环境变量，避免与部署时继承的端口不一致导致误报。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node 作为主进程运行
CMD ["node", "dist/app.js"]