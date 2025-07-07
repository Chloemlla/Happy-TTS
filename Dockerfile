# 构建前端
FROM node:22-alpine AS frontend-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置Node.js内存限制
ENV NODE_OPTIONS="--max-old-space-size=8192"

WORKDIR /app

# 首先复制package文件以利用缓存
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend

# 安装前端依赖（包括开发依赖，因为需要构建工具）
RUN rm -rf node_modules package-lock.json
RUN npm install -g npm
RUN npm install && \
    npm install @fingerprintjs/fingerprintjs && \
    npm install crypto-js && \
    npm install --save-dev @types/crypto-js
RUN npm install -g vitest && \
    npm install -g @testing-library/jest-dom && \
    npm install -g npm@11.4.2 && \
    npm install -g @testing-library/react && \
    npm install -g @testing-library/user-event && \
    npm install -g @babel/preset-env && \
    npm install -g @babel/preset-react && \
    npm install -g @babel/preset-typescript && \
    npm install -g @babel/preset-stage-2 && \
    npm install -g @babel/preset-stage-3


# 复制前端源代码（这层会在源代码变化时重新构建）
COPY frontend/ .

# 构建前端（增加内存优化和重试机制）
RUN npm run build || (echo "第一次构建失败，重试..." && npm run build) || (echo "第二次构建失败，使用简化构建..." && npm run build:simple) || (echo "简化构建失败，使用最小构建..." && npm run build:minimal)

# 确保favicon.ico存在
RUN touch dist/favicon.ico

# 构建 Docusaurus 文档
FROM node:22-alpine AS docs-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置Node.js内存限制
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 安装编译 gifsicle 所需的系统依赖和git
RUN apk add --no-cache autoconf automake libtool build-base git

WORKDIR /app

# 复制文档源代码
COPY frontend/docs/ ./docs/

# 安装文档依赖并构建
WORKDIR /app/docs
RUN npm install -g npm
RUN npm install && (npm run build:no-git || (echo "第一次构建失败，重试..." && npm run build) || (echo "第二次构建失败，使用简化构建..." && npm run build:simple))

# 构建后端
FROM node:22-alpine AS backend-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置Node.js内存限制
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

# 首先复制package文件以利用缓存
COPY package*.json ./

# 安装后端依赖（包括开发依赖，因为需要TypeScript编译器）
RUN npm install -g npm
RUN npm install && \
    npm install -g javascript-obfuscator

# 复制后端源代码和配置文件（这层会在源代码变化时重新构建）
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tsconfig.json ./

# 构建后端（增加重试机制）
RUN npm run build:backend || npm run build:backend

# 生成 openapi.json
RUN npm run generate:openapi

# 生产环境
FROM node:22-alpine

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

# 设置环境变量
ENV TZ=Asia/Shanghai

WORKDIR /app

# 安装生产环境依赖（这层会被缓存）
COPY package*.json ./
RUN npm ci --only=production && \
    npm install -g concurrently serve

# 从构建阶段复制文件
COPY --from=backend-builder /app/dist-obfuscated ./dist
COPY --from=backend-builder /app/openapi.json ./openapi.json
COPY --from=backend-builder /app/openapi.json ./dist/openapi.json
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=docs-builder /app/docs/build ./docs

# 暴露端口
EXPOSE 3000 3001 3002

# 启动服务
CMD ["npm", "start"]