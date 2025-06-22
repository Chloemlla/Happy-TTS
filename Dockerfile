# 构建前端
FROM node:20-alpine AS frontend-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# 首先复制package文件以利用缓存
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend

# 安装前端依赖（这层会被缓存）
RUN npm ci --only=production && \
    npm install @fingerprintjs/fingerprintjs && \
    npm install crypto-js && \
    npm install --save-dev @types/crypto-js

# 复制前端源代码（这层会在源代码变化时重新构建）
COPY frontend/ .

# 构建前端
RUN npm run build

# 确保favicon.ico存在
RUN touch dist/favicon.ico

# 构建后端
FROM node:20-alpine AS backend-builder

# 设置时区为上海
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

WORKDIR /app

# 首先复制package文件以利用缓存
COPY package*.json ./

# 安装后端依赖（这层会被缓存）
RUN npm ci --only=production && \
    npm install -g javascript-obfuscator

# 复制后端源代码和配置文件（这层会在源代码变化时重新构建）
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY tsconfig.json ./

# 构建后端（增加重试机制）
RUN npm run build:backend || npm run build:backend

# 生产环境
FROM node:20-alpine

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
COPY prisma/ ./prisma
COPY --from=frontend-builder /app/frontend/dist ./public

# 暴露端口
EXPOSE 3000 3001

# 启动服务
CMD ["npm", "start"]