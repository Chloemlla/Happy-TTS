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

# 禁用 rollup native 和设置环境变量
ENV ROLLUP_NO_NATIVE=1
ENV ROLLUP_SKIP_NATIVE_DEPENDENCIES=true
ENV VITE_SKIP_ROLLUP_NATIVE=true
ENV NPM_CONFIG_OPTIONAL=false

WORKDIR /app

# 首先复制package文件以利用缓存
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend

# 安装前端依赖前，彻底清理依赖和缓存
RUN rm -rf node_modules package-lock.json

# 安装最新npm
RUN npm install -g npm@latest

# 修复 Rollup 依赖问题
RUN echo "🔧 修复 Rollup 依赖问题..." && \
    npm cache clean --force

# 先安装依赖，遇到 rollup 可选依赖问题时强制修复，只安装 musl 版本的 rollup 依赖
RUN npm install --no-optional --no-audit --no-fund \
    && npm install rollup @rollup/rollup-linux-x64-musl --no-optional \
    || (echo "依赖安装失败，尝试修复..." && rm -rf node_modules package-lock.json && npm install --no-optional --no-audit --no-fund && npm install rollup @rollup/rollup-linux-x64-musl --no-optional)

RUN npm install @fingerprintjs/fingerprintjs --no-optional && \
    npm install crypto-js --no-optional && \
    npm install --save-dev @types/crypto-js --no-optional

# 安装构建时需要的全局工具（仅构建时使用）
RUN npm install -g vitest && \
    npm install -g @testing-library/jest-dom && \
    npm install -g @testing-library/react && \
    npm install -g @testing-library/user-event && \
    npm install -g @babel/preset-env && \
    npm install -g @babel/preset-react && \
    npm install -g @babel/preset-typescript && \
    npm install -g @babel/preset-stage-2 && \
    npm install -g @babel/preset-stage-3

# 复制前端源代码（这层会在源代码变化时重新构建）
COPY frontend/ .

# 构建前端（增加内存优化和重试机制，修复 Rollup 依赖问题）
RUN npm run build || (echo "第一次构建失败，清理缓存后重试..." && rm -rf node_modules/.cache && npm run build) || (echo "第二次构建失败，使用简化构建..." && npm run build:simple) || (echo "简化构建失败，使用最小构建..." && npm run build:minimal) || (echo "所有构建失败，尝试修复 Rollup 依赖..." && npm install @rollup/rollup-linux-x64-musl --save-dev && npm run build:minimal)

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

# 安装编译 gifsicle 所需的系统依赖和git
RUN apk add --no-cache autoconf automake libtool build-base git

WORKDIR /app

# 复制文档源代码
COPY frontend/docs/ ./docs/

# 安装文档依赖并构建
WORKDIR /app/docs
RUN npm install -g npm@latest
RUN npm cache clean --force && \
    npm install --no-optional --no-audit --no-fund && \
    (npm run build:no-git || (echo "第一次构建失败，重试..." && npm run build) || (echo "第二次构建失败，使用简化构建..." && npm run build:simple))

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
ENV NPM_CONFIG_OPTIONAL=false

WORKDIR /app

# 首先复制package文件以利用缓存
COPY package*.json ./

# 安装后端依赖（包括开发依赖，因为需要TypeScript编译器）
RUN npm install -g npm@latest
RUN npm cache clean --force && \
    npm install --no-optional --no-audit --no-fund && \
    npm install -g javascript-obfuscator

# 复制后端源代码和配置文件（这层会在源代码变化时重新构建）
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

# 构建后端（增加重试机制）
RUN npm run build:backend || (echo "第一次构建失败，重试..." && npm run build:backend)

# 生成 openapi.json
RUN npm run generate:openapi

# 生产环境 - 优化版本，减少未使用的依赖
FROM node:22-alpine AS production

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

# 只安装生产环境必需的依赖
COPY package*.json ./
RUN npm ci --only=production --no-optional --no-audit --no-fund && \
    npm install -g concurrently serve && \
    # 使用 npm prune 移除开发依赖
    npm prune --production && \
    # 清理 npm 缓存和临时文件
    npm cache clean --force && \
    rm -rf /tmp/.npm && \
    # 删除不必要的文件
    find node_modules -name "*.md" -delete && \
    find node_modules -name "*.txt" -delete && \
    find node_modules -name "LICENSE" -delete && \
    find node_modules -name "license" -delete && \
    find node_modules -name "CHANGELOG*" -delete && \
    find node_modules -name "README*" -delete && \
    find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -name "example" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -name "*.d.ts" -delete && \
    find node_modules -name "*.map" -delete && \
    find node_modules -name "*.ts" -delete && \
    find node_modules -name "*.tsx" -delete && \
    find node_modules -name "*.jsx" -delete && \
    find node_modules -name "*.test.js" -delete && \
    find node_modules -name "*.spec.js" -delete && \
    find node_modules -name "*.test.ts" -delete && \
    find node_modules -name "*.spec.ts" -delete && \
    find node_modules -name "*.test.tsx" -delete && \
    find node_modules -name "*.spec.tsx" -delete && \
    find node_modules -name "*.test.jsx" -delete && \
    find node_modules -name "*.spec.jsx" -delete && \
    # 删除源码映射文件
    find node_modules -name "*.map" -delete && \
    # 删除 TypeScript 定义文件（生产环境不需要）
    find node_modules -name "*.d.ts" -delete && \
    # 删除不必要的二进制文件
    find node_modules -name "*.node" ! -path "*/node_modules/node-gyp/*" -delete && \
    # 删除不必要的配置文件
    find node_modules -name ".npmrc" -delete && \
    find node_modules -name ".gitignore" -delete && \
    find node_modules -name ".eslintrc*" -delete && \
    find node_modules -name ".prettierrc*" -delete && \
    find node_modules -name "tsconfig.json" -delete && \
    find node_modules -name "webpack.config.js" -delete && \
    find node_modules -name "rollup.config.js" -delete && \
    find node_modules -name "vite.config.js" -delete && \
    find node_modules -name "jest.config.js" -delete && \
    find node_modules -name "babel.config.js" -delete && \
    # 删除不必要的脚本文件
    find node_modules -name "*.sh" -delete && \
    find node_modules -name "*.bat" -delete && \
    find node_modules -name "*.cmd" -delete && \
    # 删除不必要的文档和示例
    find node_modules -name "*.html" -delete && \
    find node_modules -name "*.css" -delete && \
    find node_modules -name "*.scss" -delete && \
    find node_modules -name "*.sass" -delete && \
    find node_modules -name "*.less" -delete && \
    # 删除不必要的图片和字体文件
    find node_modules -name "*.png" -delete && \
    find node_modules -name "*.jpg" -delete && \
    find node_modules -name "*.jpeg" -delete && \
    find node_modules -name "*.gif" -delete && \
    find node_modules -name "*.svg" -delete && \
    find node_modules -name "*.ico" -delete && \
    find node_modules -name "*.woff" -delete && \
    find node_modules -name "*.woff2" -delete && \
    find node_modules -name "*.ttf" -delete && \
    find node_modules -name "*.eot" -delete && \
    # 删除空目录
    find node_modules -type d -empty -delete && \
    # 显示清理后的 node_modules 大小
    du -sh node_modules

# 从构建阶段复制文件
COPY --from=backend-builder /app/dist-obfuscated ./dist
RUN rm -rf ./dist-obfuscated
COPY --from=backend-builder /app/openapi.json ./openapi.json
COPY --from=backend-builder /app/openapi.json ./dist/openapi.json
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=docs-builder /app/docs/build ./docs

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 更改文件所有权
RUN chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3000 3001 3002

# 启动服务
CMD ["npm", "start"]