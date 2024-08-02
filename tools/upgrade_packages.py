import asyncio
import subprocess
import json
from packaging.version import parse
import httpx

# 定义全局常量，用于控制重试次数和请求之间的延迟
MAX_RETRIES = 3  # 最大重试次数
DELAY_BETWEEN_REQUESTS = 1  # 请求之间的延迟，单位秒
PYPI_API_URL = "https://pypi.org/pypi/{}/json"  # PyPI API的URL模板

# 异常处理增强：定义一个安全执行外部命令的函数
async def safe_exec_command(cmd):
    try:
        result = await asyncio.create_subprocess_shell(
            cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await result.stdout.read(), await result.stderr.read()
        if result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, cmd, output=stdout, stderr=stderr
            )
        return stdout.decode().strip()
    except subprocess.CalledProcessError as e:
        print(f"命令执行错误: {e}")
        return None

# 新增函数：获取已安装的Python包信息
async def get_installed_packages():
    """
    异步获取已安装的Python包及其版本信息。
    使用pip list命令以JSON格式列出已安装的包，然后解析这个输出来构建一个字典，
    其中包名是键，版本号是值。
    """
    pip_list_output = await safe_exec_command(f"{sys.executable} -m pip list --format=json")
    if pip_list_output is not None:
        installed = json.loads(pip_list_output)
        return {pkg['name']: pkg['version'] for pkg in installed}
    return {}

async def fetch_latest_version(package):
    """
    异步获取指定Python包的最新版本。
    """
    url = PYPI_API_URL.format(package)
    retries = 0
    while retries <= MAX_RETRIES:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url)
                response.raise_for_status()
                releases = response.json()["releases"]
                latest_version = max(parse(version) for version in releases)
                return str(latest_version)
        except httpx.RequestError as e:
            print(f"请求错误：{e}, 包：{package}, 重试次数：{retries+1}/{MAX_RETRIES}")
            retries += 1
            if retries <= MAX_RETRIES:
                await asyncio.sleep(DELAY_BETWEEN_REQUESTS)  # 等待一段时间后重试
    print(f"重试失败，无法获取{package}的版本信息。")
    return None

async def get_latest_versions(packages):
    """
    异步获取指定Python包列表的最新版本信息。
    """
    tasks = [fetch_latest_version(package) for package in packages]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    latest_versions = {package: result for package, result in zip(packages, results) if not isinstance(result, Exception)}
    return latest_versions

async def upgrade_package(package, current_version, latest_version):
    """
    如果当前版本低于最新版本，则升级指定的Python包。
    """
    if parse(current_version) < parse(latest_version):
        upgrade_command = f"{sys.executable} -m pip install --upgrade {package}=={latest_version}"
        await safe_exec_command(upgrade_command)
        print(f"升级成功: {package} from {current_version} to {latest_version}")
    else:
        print(f"{package}已是最新版本({latest_version})，无需升级。")

async def upgrade_packages(installed_packages, latest_versions):
    """
    对需要升级的Python包执行升级操作。
    """
    for package, current_version in installed_packages.items():
        if package in latest_versions:
            await upgrade_package(package, current_version, latest_versions[package])
        else:
            print(f"未能获取{package}的最新版本信息，跳过升级。")

async def main():
    """
    主函数，程序的入口点。
    """
    installed_packages = await get_installed_packages()
    latest_versions = await get_latest_versions(list(installed_packages.keys()))
    await upgrade_packages(installed_packages, latest_versions)
    print("检查和升级操作完成。")

if __name__ == "__main__":
    import sys
    asyncio.run(main())