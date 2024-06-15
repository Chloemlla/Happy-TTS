# 第一阶段：构建依赖环境
# 使用Python 3.8的精简版镜像作为基础，用于构建应用程序的依赖环境。
# 第一阶段：构建
FROM python:3.8-slim AS build-stage
WORKDIR /usr/src/build
# 复制requirements.txt文件到构建目录。
COPY requirements.txt .
# 在隔离的环境中安装Python依赖，避免全局污染。
RUN pip install --no-cache-dir -r requirements.txt --target /usr/src/app

# 第二阶段：准备运行环境
# 使用同样的Python 3.8精简版镜像，但这次是为了部署运行时环境。
# 第二阶段：运行
FROM python:3.8-slim
WORKDIR /usr/src/app
# 从构建阶段复制已经安装好的依赖到运行时环境。
COPY --from=build-stage /usr/src/app /usr/src/app
# 为日志目录设置权限，确保应用可以写入日志。
# 只为确实需要写权限的目录设置权限
RUN mkdir -p /usr/src/app/logs && chmod 775 /usr/src/app/logs
# 设置matplotlib配置目录，避免在容器内生成个人配置文件。
# 设置环境变量替代实际创建目录
ENV MPLCONFIGDIR=/tmp/matplotlib_config
# 暴露应用监听的端口。
# 暴露端口
EXPOSE 7860
# 指定容器启动时执行的命令。
# 启动命令
CMD ["python", "app.py"]