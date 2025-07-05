import os
import paramiko
import json
import time
from io import StringIO
from dotenv import load_dotenv
import logging
import requests
from datetime import datetime


class InMemoryLogHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.logs = []

    def emit(self, record):
        self.logs.append(self.format(record))

    def get_logs(self):
        return "\n".join(self.logs)


logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

load_dotenv()

# 替换logging.basicConfig，增加内存日志收集
in_memory_handler = InMemoryLogHandler()
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
in_memory_handler.setFormatter(formatter)
logging.getLogger().addHandler(in_memory_handler)


def remote_login(server_address, username, port, private_key):
    private_key_obj = paramiko.RSAKey.from_private_key(StringIO(private_key))
    ssh = paramiko.SSHClient()

    # 在CI/CD环境中，允许首次连接未知主机
    if os.getenv("CI") or os.getenv("GITHUB_ACTIONS"):
        # CI/CD环境：使用AutoAddPolicy但记录警告
        logging.warning("CI/CD环境：自动接受未知主机密钥（仅用于部署）")
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    else:
        # 生产环境：使用严格的策略
        ssh.load_system_host_keys()  # 加载~/.ssh/known_hosts
        ssh.set_missing_host_key_policy(paramiko.RejectPolicy())  # 拒绝未知主机

    ssh.connect(
        hostname=server_address, username=username, port=port, pkey=private_key_obj
    )
    return ssh


def pull_docker_image(ssh, image_url):
    if not image_url or ":" not in image_url:
        logging.error("错误：无效的 Docker 镜像 URL 格式")
        return

    stdin, stdout, stderr = ssh.exec_command(f"docker pull {image_url}")
    logging.info(stdout.read().decode())
    logging.error(stderr.read().decode())


def backup_container_settings(ssh, container_name):
    stdin, stdout, stderr = ssh.exec_command(f"docker inspect {container_name}")
    container_info = stdout.read().decode()

    if not container_info:
        logging.error(f"错误：未找到容器 {container_name} 的信息")
        return None

    backup_file = f"/root/{container_name}_backup.json"
    with ssh.open_sftp() as sftp:
        with sftp.file(backup_file, "w") as f:
            f.write(container_info)
    logging.info(f"容器设置已备份到：{backup_file}")
    return backup_file


def recreate_container(ssh, old_container_name, new_image_url):
    new_container_name = f"{old_container_name}_old"

    stdin, stdout, stderr = ssh.exec_command("docker ps -a --format '{{.Names}}'")
    existing_containers = stdout.read().decode().splitlines()

    while new_container_name in existing_containers:
        new_container_name += "_old"

    ssh.exec_command(f"docker rename {old_container_name} {new_container_name}")

    stdin, stdout, stderr = ssh.exec_command(f"docker inspect {new_container_name}")
    container_info = json.loads(stdout.read().decode())
    ssh.exec_command(f"docker rm {new_container_name}")

    if not container_info:
        logging.error(f"错误：未找到容器 {old_container_name} 的信息")
        return

    config = container_info[0]["Config"]
    host_config = container_info[0].get("HostConfig", {})
    create_command = f"docker run -d --name {old_container_name} "

    # 继承环境变量
    env_vars = config.get("Env", [])
    for env in env_vars:
        create_command += f'-e "{env}" '

    # 继承端口映射
    port_bindings = host_config.get("PortBindings", {})
    for port, bindings in port_bindings.items():
        for binding in bindings:
            host_ip = binding.get("HostIp", "0.0.0.0")
            host_port = binding.get("HostPort")
            create_command += f"-p {host_ip}:{host_port}:{port.split('/')[0]} "

    # 继承挂载卷和权限
    mounts = host_config.get("Mounts", [])
    # 兼容旧版docker inspect格式，补充MountPoints和Volumes
    mount_points = container_info[0].get("MountPoints", {})
    volumes = container_info[0].get("Volumes", {})
    all_mount_targets = set()
    # 先收集已拼接的目标目录
    for mount in mounts:
        if mount.get("Target"):
            all_mount_targets.add(mount["Target"])
    # 检查MountPoints
    for target, mp in mount_points.items():
        if target not in all_mount_targets:
            source = mp.get("Source")
            if source:
                logging.info(f"自动补全挂载: {source} -> {target}")
                create_command += f"-v {source}:{target} "
                all_mount_targets.add(target)
    # 检查Volumes
    for target, source in volumes.items():
        if target not in all_mount_targets:
            logging.info(f"自动补全挂载: {source} -> {target}")
            create_command += f"-v {source}:{target} "
            all_mount_targets.add(target)

    # 继承网络设置
    networks = container_info[0].get("NetworkSettings", {}).get("Networks", {})
    for network_name in networks.keys():
        create_command += f"--network {network_name} "

    # 继承重启策略
    restart_policy = host_config.get("RestartPolicy", {})
    if restart_policy.get("Name"):
        create_command += f"--restart {restart_policy['Name']} "
        if restart_policy.get("MaximumRetryCount") > 0:
            create_command += (
                f"--restart-max-retries {restart_policy['MaximumRetryCount']} "
            )

    # 继承用户设置
    if config.get("User"):
        create_command += f"--user {config['User']} "

    # 继承工作目录
    if config.get("WorkingDir"):
        create_command += f"--workdir {config['WorkingDir']} "

    # 继承资源限制
    if host_config.get("Memory"):
        create_command += f"--memory {host_config['Memory']}b "
    if host_config.get("MemorySwap"):
        create_command += f"--memory-swap {host_config['MemorySwap']}b "
    if host_config.get("CpuShares"):
        create_command += f"--cpu-shares {host_config['CpuShares']} "

    # 继承设备映射
    devices = host_config.get("Devices", [])
    for device in devices:
        path_on_host = device.get("PathOnHost", "")
        path_in_container = device.get("PathInContainer", "")
        cgroupPermissions = device.get("CgroupPermissions", "")
        if path_on_host and path_in_container:
            create_command += f"--device {path_on_host}:{path_in_container}"
            if cgroupPermissions:
                create_command += f":{cgroupPermissions}"
            create_command += " "

    time.sleep(5)
    create_command += f"{new_image_url}"

    stdin, stdout, stderr = ssh.exec_command("docker ps -a --format '{{.Names}}'")
    existing_containers = stdout.read().decode().splitlines()

    if new_container_name in existing_containers:
        logging.info(f"旧容器 {new_container_name} 存在，正在删除...")
        ssh.exec_command(f"docker rm -f {new_container_name}")

    time.sleep(5)
    logging.info("已休眠5s，正在创建新容器")
    stdin, stdout, stderr = ssh.exec_command(create_command)
    logging.info(stdout.read().decode())
    logging.error(stderr.read().decode())


def cleanup_unused_images(ssh):
    logging.info("正在清理未使用的 Docker 镜像...")
    stdin, stdout, stderr = ssh.exec_command("docker image prune -a -f")
    logging.info(stdout.read().decode())
    logging.error(stderr.read().decode())


def upload_log_file(log_path, admin_password):
    """
    上传日志/文件到 https://tts-api.hapxs.com/api/sharelog，返回短链。
    """
    if not os.path.exists(log_path):
        logging.warning(f"日志文件 {log_path} 不存在，跳过上传。")
        return None
    file_size = os.path.getsize(log_path)
    if file_size >= 25600:
        logging.warning(f"日志文件大于25KB（{file_size}字节），不上传。")
        return None
    url = "https://tts-api.hapxs.com/api/sharelog"
    with open(log_path, "rb") as f:
        files = {"file": (os.path.basename(log_path), f)}
        data = {"adminPassword": admin_password}
        try:
            resp = requests.post(url, files=files, data=data, timeout=15)
            if resp.ok and "link" in resp.json():
                link = resp.json()["link"]
                logging.info(f"日志已上传: {link}")
                return link
            else:
                logging.warning(f"API响应异常: {resp.text}")
        except Exception as e:
            logging.warning(f"API上传日志失败: {repr(e)}")
    return None


def query_log_file(log_id, admin_password):
    """
    查询日志内容，POST到 https://tts-api.hapxs.com/api/sharelog/{id}，body为{adminPassword}
    """
    url = f"https://tts-api.hapxs.com/api/sharelog/{log_id}"
    data = {"adminPassword": admin_password}
    try:
        resp = requests.post(url, json=data, timeout=10)
        if resp.ok and "content" in resp.json():
            return resp.json()["content"]
        else:
            logging.warning(f"日志查询失败: {resp.text}")
    except Exception as e:
        logging.warning(f"日志查询异常: {repr(e)}")
    return None


def write_deploy_log(server_address, username, container_names, image_url):
    log_path = "deploy.log"
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(f"部署时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"服务器: {server_address}\n")
        f.write(f"用户名: {username}\n")
        f.write(f"容器: {', '.join(container_names)}\n")
        f.write(f"镜像: {image_url}\n")
        f.write("\n--- 运行日志 ---\n")
        f.write(in_memory_handler.get_logs())
    return log_path


def main():
    image_url = os.getenv("IMAGE_URL", "").strip()
    server_addresses = os.getenv("SERVER_ADDRESS", "").split(",")
    usernames = os.getenv("USERNAME", "").split(",")
    ports = os.getenv("PORT", "22").split(",")
    private_keys = os.getenv("PRIVATE_KEY", "").split(",")
    container_names_list = os.getenv("CONTAINER_NAMES", "").split(",")
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    num_servers = len(server_addresses)
    if not all(
        [
            len(server_addresses)
            == len(usernames)
            == len(ports)
            == len(private_keys)
            == len(container_names_list)
        ]
    ):
        logging.error("请确保所有服务器相关环境变量数量一致，并用英文逗号分隔。")
        return

    for i in range(num_servers):
        server_address = server_addresses[i].strip()
        username = usernames[i].strip()
        port = int(ports[i].strip()) if ports[i].strip() else 22
        private_key = private_keys[i].strip()
        container_names = [
            name.strip() for name in container_names_list[i].split("&") if name.strip()
        ]

        if not all([server_address, username, private_key, image_url, container_names]):
            logging.error(f"第{i+1}组服务器配置有缺失，请检查环境变量。")
            continue

        logging.info(f"\n===== 正在处理服务器: {server_address} =====")
        ssh = remote_login(server_address, username, port, private_key)

        for container_name in container_names:
            logging.info(f"正在处理容器：{container_name}")
            backup_file = backup_container_settings(ssh, container_name)
            if not backup_file:
                continue
            pull_docker_image(ssh, image_url)
            recreate_container(ssh, container_name, image_url)

        cleanup_unused_images(ssh)
        ssh.close()

        # 自动生成并上传日志
        time.sleep(10)  # 等待2秒，确保日志文件已生成
        log_path = write_deploy_log(
            server_address, username, container_names, image_url
        )
        link = upload_log_file(log_path, admin_password)
        if link:
            logging.info(f"日志已上传: {link}")
        else:
            logging.info("日志上传失败或未上传。")


if __name__ == "__main__":
    main()
