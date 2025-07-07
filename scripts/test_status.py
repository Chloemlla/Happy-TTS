#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试服务状态路由
"""

import requests
import json

BASE_URL = "https://tts-api.hapxs.com"


def test_status():
    """测试服务状态路由"""
    print("测试服务状态路由")
    print("=" * 50)

    # 测试不同的状态路由
    test_cases = [
        ("根状态", "/api/status"),
        ("状态子路由", "/api/status/status"),
        ("网络状态", "/api/network/status"),
    ]

    for name, path in test_cases:
        url = f"{BASE_URL}{path}"
        print(f"\n测试: {name}")
        print(f"URL: {url}")

        try:
            response = requests.get(url, timeout=10)
            print(f"状态码: {response.status_code}")

            if response.status_code == 200:
                print("✓ 成功")
                try:
                    data = response.json()
                    print(f"响应: {json.dumps(data, ensure_ascii=False, indent=2)}")
                except:
                    print(f"响应: {response.text}")
            elif response.status_code == 404:
                print("✗ 404 Not Found")
            elif response.status_code == 401:
                print("✗ 401 Unauthorized")
            else:
                print(f"✗ 其他错误: {response.text}")

        except Exception as e:
            print(f"✗ 请求异常: {e}")

        print("-" * 30)


if __name__ == "__main__":
    test_status()
