#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单的API路径测试脚本
验证修复后的API路径是否正确
"""

import requests
import json

BASE_URL = "https://tts-api.hapxs.com"


def test_endpoint(name, path, method="GET", params=None):
    """测试单个端点"""
    url = f"{BASE_URL}{path}"

    print(f"测试: {name}")
    print(f"URL: {url}")
    print(f"方法: {method}")
    if params:
        print(f"参数: {params}")

    try:
        if method == "GET":
            response = requests.get(url, params=params, timeout=10)
        else:
            response = requests.post(url, json=params, timeout=10)

        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            print("✓ 成功")
            try:
                data = response.json()
                print(
                    f"响应: {json.dumps(data, ensure_ascii=False, indent=2)[:200]}..."
                )
            except:
                print(f"响应: {response.text[:200]}...")
        elif response.status_code == 429:
            print("⚠ 频率限制")
        else:
            print(f"✗ 失败: {response.text}")

    except Exception as e:
        print(f"✗ 请求异常: {e}")

    print("-" * 50)


def main():
    """主测试函数"""
    print("开始测试API路径修复")
    print("=" * 50)

    # 测试修复后的端点
    test_cases = [
        ("精准IP查询", "/api/network/ipquery", "GET", {"ip": "8.8.8.8"}),
        ("IP信息查询", "/api/network/ipquery", "GET", {"ip": "8.8.8.8"}),
        ("随机一言", "/api/network/yiyan", "GET", {"type": "hitokoto"}),
        ("古诗词", "/api/network/yiyan", "GET", {"type": "poetry"}),
        ("抖音热榜", "/api/network/douyinhot", "GET"),
        (
            "字符串Hash",
            "/api/network/hash",
            "GET",
            {"text": "Hello World", "type": "md5"},
        ),
        (
            "Base64编码",
            "/api/network/base64",
            "GET",
            {"text": "Hello World", "type": "encode"},
        ),
        (
            "Base64解码",
            "/api/network/base64",
            "GET",
            {"text": "SGVsbG8gV29ybGQ=", "type": "decode"},
        ),
        ("BMI计算", "/api/network/bmi", "GET", {"weight": 70, "height": 175}),
        (
            "FLAC转MP3",
            "/api/network/flactomp3",
            "GET",
            {"url": "https://example.com/test.flac"},
        ),
        ("随机驾考题", "/api/network/jiakao", "GET", {"subject": "1"}),
    ]

    for name, path, method, *args in test_cases:
        params = args[0] if args else None
        test_endpoint(name, path, method, params)

    print("测试完成")


if __name__ == "__main__":
    main()
