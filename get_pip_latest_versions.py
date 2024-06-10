import requests
from packaging.version import parse

def get_latest_versions(packages):
    """
    获取给定Python包列表的最新版本号。
    
    :param packages: 包名的列表
    :return: 一个字典，键为包名，值为对应的最新版本号
    """
    base_url = "https://pypi.org/pypi/{}/json"
    latest_versions = {}
    
    for package in packages:
        response = requests.get(base_url.format(package))
        if response.status_code == 200:
            releases = response.json()["releases"]
            # 获取最高版本号，这里使用parse来确保版本号被正确排序
            latest_version = max(parse(version) for version in releases)
            latest_versions[package] = str(latest_version)
        else:
            print(f"无法获取{package}的版本信息，状态码：{response.status_code}")
    
    return latest_versions

# 需要查询的包列表
packages_to_check = [
    'os',  # 注意：像'os', 'sys'这样的标准库不会在PyPI上列出
    'time',
    'difflib',
    'tempfile',
    'logging',
    'shutil',
    'hashlib',
    'gradio',
    'base64',
    'json',
    'Flask',
    'Thread',
    'OpenAI',
    'dotenv',
    'datetime',
    'timedelta',
    'Observer',
]

# 调用函数并打印结果
latest_versions = get_latest_versions(packages_to_check)
for package, version in latest_versions.items():
    print(f"{package}: {version}")