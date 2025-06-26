import os
import paramiko
import json
import time
from io import StringIO
from dotenv import load_dotenv
import logging

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

load_dotenv()


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
    if mounts:
        for mount in mounts:
            type = mount.get("Type", "")
            source = mount.get("Source", "")
            target = mount.get("Target", "")
            mode = mount.get("Mode", "")
            rw = mount.get("RW", True)  # 读写权限
            propagation = mount.get("Propagation", "")  # 传播模式

            if type and source and target:
                mount_opts = []

                # 添加读写模式
                if not rw:
                    mount_opts.append("ro")

                # 添加传播模式
                if propagation:
                    mount_opts.append(propagation)

                # 添加 SELinux 标签选项
                selinux_label = mount.get("SELinuxRelabel", "")
                if selinux_label:
                    mount_opts.append("Z" if selinux_label == "shared" else "z")

                # 添加其他模式选项
                if mode:
                    mount_opts.append(mode)

                # 构建挂载选项字符串
                opts_str = ",".join(mount_opts) if mount_opts else ""

                if type == "bind":
                    # 确保源路径存在
                    source_path = os.path.abspath(source)
                    if not os.path.exists(source_path):
                        os.makedirs(source_path, exist_ok=True)
                    # 添加绑定挂载和选项
                    create_command += f"-v {source_path}:{target}"
                elif type == "volume":
                    # 对于命名卷，直接使用卷名
                    create_command += f"-v {source}:{target}"

                # 添加挂载选项
                if opts_str:
                    create_command = create_command.rstrip() + f":{opts_str} "
                else:
                    create_command += " "

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


def main():
    image_url = os.getenv("IMAGE_URL", "").strip()
    server_addresses = os.getenv("SERVER_ADDRESS", "").split(",")
    usernames = os.getenv("USERNAME", "").split(",")
    ports = os.getenv("PORT", "22").split(",")
    private_keys = os.getenv("PRIVATE_KEY", "").split(",")
    container_names_list = os.getenv("CONTAINER_NAMES", "").split(",")

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


if __name__ == "__main__":
    main()
