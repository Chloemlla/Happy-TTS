# 构建前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 安装前端依赖
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install
RUN npm install @fingerprintjs/fingerprintjs

# 复制前端源代码
COPY frontend/ .

# 构建前端
RUN npm run build

# 构建后端
FROM node:18-alpine AS backend-builder

WORKDIR /app

# 安装后端依赖
COPY package*.json ./
RUN npm install

# 复制后端源代码
COPY src/ ./src/
COPY tsconfig.json ./

# 构建后端
RUN npm run build:backend

# 生产环境
FROM node:18-alpine

WORKDIR /app

# 安装生产环境依赖
COPY package*.json ./
RUN npm install --production && \
    npm install -g concurrently serve

# 从构建阶段复制文件
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public

# 创建数据目录
RUN mkdir -p /app/data && chmod 777 /app/data

# 暴露端口
EXPOSE 3000 3001

# 启动服务
CMD ["npm", "start"] 