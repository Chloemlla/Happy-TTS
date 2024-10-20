# 导入必要的库
import asyncio
import subprocess
import json
from packaging.version import parse
import httpx

# 定义全局常量，用于控制重试次数和请求之间的延迟
MAX_RETRIES = 3  # 最大重试次数
DELAY_BETWEEN_REQUESTS = 1  # 请求之间的延迟，单位秒


# 新增函数：获取已安装的Python包信息
def get_installed_packages():
    """
    获取已安装的Python包及其版本信息。

    使用pip list命令以JSON格式列出已安装的包，然后解析这个输出来构建一个字典，
    其中包名是键，版本号是值。
    """
    output = subprocess.check_output(
        [sys.executable, "-m", "pip", "list", "--format=json"]
    )
    installed = json.loads(output)
    return {pkg["name"]: pkg["version"] for pkg in installed}


async def fetch_latest_version(package):
    """
    异步获取指定Python包的最新版本。

    尝试从PyPI网站获取指定包的最新版本信息。如果请求失败，将根据重试策略进行重试。
    """
    base_url = "https://pypi.org/pypi/{}/json"
    retries = 0
    while retries <= MAX_RETRIES:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(base_url.format(package))
                response.raise_for_status()
                releases = response.json()["releases"]
                latest_version = max(parse(version) for version in releases)
                return str(latest_version)
        except httpx.RequestError as e:
            # 请求出错时，打印错误信息并决定是否重试
            print(f"请求错误：{e}，包：{package}，重试次数：{retries+1}/{MAX_RETRIES}")
            retries += 1
            if retries <= MAX_RETRIES:
                await asyncio.sleep(DELAY_BETWEEN_REQUESTS)  # 等待一段时间后重试
    # 如果重试失败，返回None
    print(f"重试失败，无法获取{package}的版本信息。")
    return None


async def get_latest_versions(packages):
    """
    异步获取指定Python包列表的最新版本信息。

    对每个包并行调用fetch_latest_version函数，然后收集结果。
    """
    tasks = [fetch_latest_version(package) for package in packages]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    latest_versions = {
        package: result
        for package, result in zip(packages, results)
        if not isinstance(result, Exception)
    }
    return latest_versions


async def upgrade_package(package, current_version, latest_version):
    """
    如果当前版本低于最新版本，则升级指定的Python包。
    """
    if parse(current_version) < parse(latest_version):
        upgrade_command = (
            f"{sys.executable} -m pip install --upgrade {package}=={latest_version}"
        )
        try:
            result = subprocess.run(
                upgrade_command,
                shell=True,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            print(f"升级成功: {package} from {current_version} to {latest_version}")
        except subprocess.CalledProcessError as e:
            print(f"升级失败: {package}. 错误信息: {e.stderr.decode()}")
    else:
        print(f"{package}已是最新版本({latest_version})，无需升级。")


async def upgrade_packages(installed_packages, latest_versions):
    """
    对需要升级的Python包执行升级操作。

    根据已安装包和最新版本的字典，对需要升级的包调用upgrade_package函数。
    如果某个包的最新版本信息无法获取，则跳过该包。
    """
    for package, current_version in installed_packages.items():
        if package in latest_versions:
            await upgrade_package(package, current_version, latest_versions[package])
        else:
            print(f"未能获取{package}的最新版本信息，跳过升级。")


async def main():
    """
    主函数，程序的入口点。

    执行如下步骤：
    1. 获取已安装的Python包及其版本信息；
    2. 异步获取这些包的最新版本信息；
    3. 对需要升级的包执行升级操作。
    """
    installed_packages = get_installed_packages()

    # 获取所有包的最新版本（异步，带重试和延迟）
    latest_versions = await get_latest_versions(list(installed_packages.keys()))

    await upgrade_packages(installed_packages, latest_versions)
    print("检查和升级操作完成。")


# 如果是直接运行这个文件，则执行main函数
if __name__ == "__main__":
    import sys

    asyncio.run(main())
