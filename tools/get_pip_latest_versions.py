import requests
from packaging.version import parse
import os
import random
import string

def get_latest_versions(packages):
    """
    获取给定Python包列表的最新版本号。
    """
    base_url = "https://pypi.org/pypi/{}/json"
    latest_versions = {}
    
    for package in packages:
        response = requests.get(base_url.format(package))
        if response.status_code == 200:
            releases = response.json()["releases"]
            latest_version = max(parse(version) for version in releases)
            latest_versions[package] = str(latest_version)
        else:
            print(f"无法获取{package}的版本信息，状态码：{response.status_code}")
    
    return latest_versions

def generate_random_filename(extension=".txt"):
    """生成随机文件名"""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=8)) + extension

# 从文本文件读取包列表
def read_packages_from_txt(txt_file):
    with open(txt_file, 'r') as file:
        return [line.strip() for line in file.readlines()]

# 文件路径
txt_file_path = "packages_to_check.txt"

packages_to_check = read_packages_from_txt(txt_file_path)

latest_versions = get_latest_versions(packages_to_check)

# 生成随机文件名
filename = generate_random_filename("_requirements.txt")

# 将结果写入文件
with open(filename, "w") as file:
    for package, version in latest_versions.items():
        file.write(f"{package}=={version}\n")

print(f"Requirements saved to {filename}")