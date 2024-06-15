# 第一阶段：更新依赖
FROM python:3.8-slim AS update-stage
WORKDIR /usr/src/update
# 先安装upgrade_packages.py脚本运行所需的包
RUN pip install packaging
RUN pip install httpx
COPY tools/upgrade_packages.py .
# 现在应该可以成功运行脚本了
RUN python upgrade_packages.py

# 第二阶段：构建依赖环境
FROM python:3.8-slim AS build-stage
WORKDIR /usr/src/build
COPY --from=update-stage /usr/src/update/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --target /usr/src/app

# 第三阶段：准备运行环境
FROM python:3.8-slim
WORKDIR /usr/src/app
COPY --from=build-stage /usr/src/app /usr/src/app

# 为日志目录设置权限，确保应用可以写入日志。
RUN mkdir -p /usr/src/app/logs && chmod 775 /usr/src/app/logs

# 设置matplotlib配置目录，避免在容器内生成个人配置文件。
ENV MPLCONFIGDIR=/tmp/matplotlib_config

# 暴露应用监听的端口。
EXPOSE 7860

# 指定容器启动时执行的命令。
CMD ["python", "app.py"]