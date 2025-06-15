FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm install

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 安装serve用于生产环境
RUN npm install -g serve

# 暴露端口
EXPOSE 5173

# 启动服务
CMD ["serve", "-s", "dist", "-l", "5173"] 