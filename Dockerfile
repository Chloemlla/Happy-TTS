# 第一阶段：构建依赖环境
FROM python:3.8-slim AS build-stage
WORKDIR /usr/src/app

# 先安装upgrade_packages.py脚本运行所需的包，版本锁定提高安全性
RUN pip install --upgrade --no-cache-dir packaging==21.0 httpx==0.18.2

# 指定requirements.txt作为缓存的一部分，加速构建过程
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target /usr/src/app

# 第二阶段：准备运行环境
FROM python:3.8-slim
WORKDIR /usr/src/app
COPY --from=build-stage /usr/src/app /usr/src/app

# 设置日志目录和严格的权限设置
RUN mkdir -p /usr/src/app/logs && chmod 750 /usr/src/app/logs

# 设置matplotlib配置目录，避免在容器内生成个人配置文件。
ENV MPLCONFIGDIR=/tmp/matplotlib_config

# 暴露应用监听的端口。
EXPOSE 7860

# 指定容器启动时执行的命令。
CMD ["python", "/usr/src/app/app.py"]